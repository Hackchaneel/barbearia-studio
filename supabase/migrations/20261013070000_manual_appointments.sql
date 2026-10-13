-- Let authenticated shop staff register a confirmed appointment made in person
-- or by phone. Availability and overlap are rechecked in the same transaction.
create or replace function public.create_manual_appointment(
  _barbershop_id uuid,
  _service_id uuid,
  _barber_member_id uuid,
  _starts_at timestamptz,
  _customer_name text,
  _customer_phone text,
  _customer_email text default null,
  _notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_row public.services%rowtype;
  appointment_uuid uuid;
begin
  if not (
    public.has_shop_role(_barbershop_id, array['owner','manager']::public.member_role[])
    or public.is_current_barber(_barbershop_id, _barber_member_id)
  ) then
    raise exception 'You do not have access to create appointments for this barber.' using errcode = '42501';
  end if;

  if length(trim(coalesce(_customer_name, ''))) not between 2 and 120
     or length(regexp_replace(coalesce(_customer_phone, ''), '[^0-9]', '', 'g')) not between 10 and 15
     or (_customer_email is not null and length(_customer_email) > 254)
     or length(coalesce(_notes, '')) > 1000 then
    raise exception 'Invalid customer details.' using errcode = '22023';
  end if;

  select service.* into service_row
  from public.services as service
  where service.id = _service_id
    and service.barbershop_id = _barbershop_id
    and service.is_active;
  if not found then
    raise exception 'Service not found.' using errcode = 'P0002';
  end if;

  -- The availability RPC checks shop hours, the barber's schedule, breaks,
  -- assigned services, blocks, existing appointments and that the slot is future.
  if not exists (
    select 1
    from public.get_available_slots(
      _barbershop_id,
      _service_id,
      (_starts_at at time zone (select shop.timezone from public.barbershops as shop where shop.id = _barbershop_id))::date,
      _barber_member_id
    ) as available
    where available.barber_member_id = _barber_member_id
      and available.starts_at = _starts_at
  ) then
    raise exception 'The selected time is no longer available.' using errcode = '23P01';
  end if;

  -- Expired web holds otherwise retain their PostgreSQL exclusion range.
  with expired as (
    update public.appointments as appointment
    set status = 'expired'
    where appointment.barbershop_id = _barbershop_id
      and appointment.status = 'pending'
      and appointment.hold_expires_at <= now()
    returning appointment.id
  )
  insert into public.appointment_events (barbershop_id, appointment_id, event_type)
  select _barbershop_id, expired.id, 'hold_expired' from expired;

  insert into public.appointments (
    barbershop_id, service_id, barber_member_id,
    customer_name, customer_phone, customer_email,
    starts_at, ends_at, buffer_minutes, status, amount_cents, hold_expires_at,
    notes, created_by
  ) values (
    _barbershop_id, _service_id, _barber_member_id,
    trim(_customer_name), trim(_customer_phone), nullif(trim(coalesce(_customer_email, '')), ''),
    _starts_at, _starts_at + make_interval(mins => service_row.duration_minutes),
    service_row.buffer_minutes, 'confirmed', service_row.price_cents, null,
    trim(coalesce(_notes, '')), (select auth.uid())
  ) returning id into appointment_uuid;

  insert into public.appointment_events (
    barbershop_id, appointment_id, actor_user_id, event_type, details
  ) values (
    _barbershop_id, appointment_uuid, (select auth.uid()), 'appointment_created_manually',
    jsonb_build_object('service_id', _service_id, 'barber_member_id', _barber_member_id)
  );

  return appointment_uuid;
end;
$$;

revoke all on function public.create_manual_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.create_manual_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text) to authenticated;
