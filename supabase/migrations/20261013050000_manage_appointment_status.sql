-- Allow authenticated shop staff to cancel eligible appointments or complete
-- finished appointments, with authorization and an audit event in one transaction.
create or replace function public.update_appointment_status(
  _appointment_id uuid,
  _new_status public.appointment_status
)
returns public.appointment_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.appointments%rowtype;
  previous_status public.appointment_status;
begin
  if _new_status not in ('cancelled', 'completed') then
    raise exception 'This status transition is not allowed.' using errcode = '22023';
  end if;

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

  previous_status := appointment_row.status;

  if _new_status = 'completed' then
    if previous_status <> 'confirmed' or appointment_row.ends_at > now() then
      raise exception 'Only a finished, confirmed appointment can be completed.' using errcode = '22023';
    end if;
  elsif _new_status = 'cancelled' then
    if previous_status not in ('pending', 'confirmed') or appointment_row.starts_at <= now() then
      raise exception 'Only a future pending or confirmed appointment can be cancelled.' using errcode = '22023';
    end if;
  end if;

  update public.appointments
  set status = _new_status
  where id = appointment_row.id;

  insert into public.appointment_events (
    barbershop_id, appointment_id, actor_user_id, event_type, details
  ) values (
    appointment_row.barbershop_id,
    appointment_row.id,
    (select auth.uid()),
    'appointment_status_changed',
    jsonb_build_object('from', previous_status, 'to', _new_status)
  );

  return _new_status;
end;
$$;

revoke all on function public.update_appointment_status(uuid, public.appointment_status) from public, anon;
grant execute on function public.update_appointment_status(uuid, public.appointment_status) to authenticated;
