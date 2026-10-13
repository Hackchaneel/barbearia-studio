-- Move a confirmed appointment only after validating the requested time against
-- the shop schedule, barber hours, service offering, breaks, blocks and bookings.
create or replace function public.reschedule_appointment(
  _appointment_id uuid,
  _starts_at timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.appointments%rowtype;
  shop_timezone text;
  service_duration integer;
  requested_local_date date;
  new_ends_at timestamptz;
begin
  select appointment.* into appointment_row
  from public.appointments as appointment
  where appointment.id = _appointment_id
  for update;

  if not found then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;

  if not (
    public.has_shop_role(appointment_row.barbershop_id, array['owner','manager']::public.member_role[])
    or public.is_current_barber(appointment_row.barbershop_id, appointment_row.barber_member_id)
  ) then
    raise exception 'You do not have access to this appointment.' using errcode = '42501';
  end if;

  if appointment_row.status <> 'confirmed' or appointment_row.starts_at <= now() then
    raise exception 'Only future confirmed appointments can be rescheduled.' using errcode = '22023';
  end if;
  if _starts_at is null or _starts_at <= now() then
    raise exception 'The new appointment time must be in the future.' using errcode = '22023';
  end if;
  if _starts_at = appointment_row.starts_at then
    return query select appointment_row.starts_at, appointment_row.ends_at;
    return;
  end if;

  select shop.timezone, service.duration_minutes
    into shop_timezone, service_duration
  from public.barbershops as shop
  join public.services as service
    on service.barbershop_id = shop.id
   and service.id = appointment_row.service_id
   and service.is_active
  where shop.id = appointment_row.barbershop_id;
  if shop_timezone is null or service_duration is null then
    raise exception 'Barbershop or active service not found.' using errcode = 'P0002';
  end if;
  requested_local_date := (_starts_at at time zone shop_timezone)::date;

  -- Temporarily release this appointment's existing exclusion range inside
  -- the transaction. Any later exception rolls this change back atomically.
  update public.appointments as appointment
  set status = 'cancelled'
  where appointment.id = appointment_row.id;

  if not exists (
    select 1
    from public.get_available_slots(
      appointment_row.barbershop_id,
      appointment_row.service_id,
      requested_local_date,
      appointment_row.barber_member_id
    ) as available
    where available.barber_member_id = appointment_row.barber_member_id
      and available.starts_at = _starts_at
  ) then
    raise exception 'The requested time is unavailable or outside business hours.' using errcode = '23P01';
  end if;

  new_ends_at := _starts_at + make_interval(mins => service_duration);

  update public.appointments as appointment
  set starts_at = _starts_at,
      ends_at = new_ends_at,
      status = 'confirmed',
      hold_expires_at = null
  where appointment.id = appointment_row.id;

  insert into public.appointment_events (
    barbershop_id, appointment_id, actor_user_id, event_type, details
  ) values (
    appointment_row.barbershop_id,
    appointment_row.id,
    (select auth.uid()),
    'appointment_rescheduled',
    jsonb_build_object(
      'from_starts_at', appointment_row.starts_at,
      'to_starts_at', _starts_at
    )
  );

  return query select _starts_at, new_ends_at;
end;
$$;

revoke all on function public.reschedule_appointment(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_appointment(uuid, timestamptz) to authenticated;
