-- Track payments received directly at the barbershop without exposing writes
-- to the browser. One payment remains associated with each appointment.
alter table public.payments
  add column payment_method text,
  add constraint payments_payment_method_check
    check (payment_method is null or payment_method in ('cash', 'pix', 'debit_card', 'credit_card', 'other'));

create or replace function public.record_in_person_payment(
  _appointment_id uuid,
  _payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.appointments%rowtype;
  payment_row public.payments%rowtype;
  payment_uuid uuid;
begin
  if _payment_method is null or _payment_method not in ('cash', 'pix', 'debit_card', 'credit_card', 'other') then
    raise exception 'Unsupported in-person payment method.' using errcode = '22023';
  end if;

  select appointment.* into appointment_row
  from public.appointments as appointment
  where appointment.id = _appointment_id
  for update;

  if not found then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;

  if not public.has_shop_role(appointment_row.barbershop_id, array['owner','manager']::public.member_role[]) then
    raise exception 'Only shop owners and managers can record in-person payments.' using errcode = '42501';
  end if;

  if appointment_row.status not in ('confirmed', 'completed') then
    raise exception 'Only confirmed or completed appointments can receive an in-person payment.' using errcode = '22023';
  end if;

  select payment.* into payment_row
  from public.payments as payment
  where payment.barbershop_id = appointment_row.barbershop_id
    and payment.appointment_id = appointment_row.id
  for update;

  if found then
    if payment_row.provider = 'in_person'
       and payment_row.status = 'approved'
       and payment_row.payment_method = _payment_method then
      return payment_row.id;
    end if;
    raise exception 'A payment is already registered for this appointment.' using errcode = '23505';
  end if;

  insert into public.payments (
    barbershop_id, appointment_id, provider, idempotency_key, status,
    amount_cents, currency, approved_at, payment_method
  ) values (
    appointment_row.barbershop_id,
    appointment_row.id,
    'in_person',
    gen_random_uuid()::text,
    'approved',
    appointment_row.amount_cents,
    'BRL',
    now(),
    _payment_method
  ) returning id into payment_uuid;

  insert into public.appointment_events (
    barbershop_id, appointment_id, actor_user_id, event_type, details
  ) values (
    appointment_row.barbershop_id,
    appointment_row.id,
    (select auth.uid()),
    'in_person_payment_recorded',
    jsonb_build_object('payment_method', _payment_method, 'amount_cents', appointment_row.amount_cents)
  );

  return payment_uuid;
end;
$$;

revoke all on function public.record_in_person_payment(uuid, text) from public, anon;
grant execute on function public.record_in_person_payment(uuid, text) to authenticated;
