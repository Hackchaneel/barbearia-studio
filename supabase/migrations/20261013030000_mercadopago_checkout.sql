-- Mercado Pago Checkout Pro preference storage and trusted payment reconciliation.
alter table public.payments
  add column provider_preference_id text,
  add column checkout_url text,
  add column checkout_claimed_at timestamptz;

create unique index payments_one_per_appointment_idx
  on public.payments(barbershop_id, appointment_id);
create unique index payments_provider_preference_idx
  on public.payments(provider_preference_id)
  where provider_preference_id is not null;

create or replace function public.claim_payment_checkout(_appointment_id uuid)
returns table (
  payment_id uuid,
  appointment_id uuid,
  barbershop_id uuid,
  amount_cents integer,
  idempotency_key text,
  hold_expires_at timestamptz,
  should_create boolean,
  checkout_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.appointments%rowtype;
  payment_row public.payments%rowtype;
begin
  select * into appointment_row
  from public.appointments as appointment
  where appointment.id = _appointment_id
  for update;

  if not found or appointment_row.status <> 'pending'
     or appointment_row.hold_expires_at is null
     or appointment_row.hold_expires_at <= now() then
    raise exception 'Appointment hold is missing or expired.' using errcode = 'P0002';
  end if;

  insert into public.payments (
    barbershop_id, appointment_id, idempotency_key, status, amount_cents, currency
  ) values (
    appointment_row.barbershop_id, appointment_row.id, gen_random_uuid()::text,
    'pending', appointment_row.amount_cents, 'BRL'
  ) on conflict (barbershop_id, appointment_id) do nothing;

  select * into payment_row
  from public.payments as payment
  where payment.barbershop_id = appointment_row.barbershop_id
    and payment.appointment_id = appointment_row.id
  for update;

  if payment_row.provider_preference_id is not null and payment_row.checkout_url is not null then
    return query select payment_row.id, appointment_row.id, appointment_row.barbershop_id,
      payment_row.amount_cents, payment_row.idempotency_key, appointment_row.hold_expires_at,
      false, payment_row.checkout_url;
    return;
  end if;

  if payment_row.checkout_claimed_at is not null
     and payment_row.checkout_claimed_at > now() - interval '2 minutes' then
    raise exception 'Checkout preference is already being created.' using errcode = '55P03';
  end if;

  update public.payments as payment
  set checkout_claimed_at = now()
  where payment.id = payment_row.id
  returning * into payment_row;

  return query select payment_row.id, appointment_row.id, appointment_row.barbershop_id,
    payment_row.amount_cents, payment_row.idempotency_key, appointment_row.hold_expires_at,
    true, null::text;
end;
$$;

create or replace function public.finish_payment_checkout(
  _payment_id uuid,
  _preference_id text,
  _checkout_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(trim(_preference_id), '') = '' or coalesce(trim(_checkout_url), '') = '' then
    raise exception 'Invalid checkout preference.' using errcode = '22023';
  end if;
  update public.payments
  set provider_preference_id = _preference_id,
      checkout_url = _checkout_url,
      checkout_claimed_at = null
  where id = _payment_id
    and provider = 'mercado_pago'
    and provider_preference_id is null;
  if not found then
    raise exception 'Payment intent not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.release_payment_checkout(_payment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments
  set checkout_claimed_at = null
  where id = _payment_id and provider_preference_id is null;
$$;

create or replace function public.sync_mercado_pago_payment(
  _appointment_id uuid,
  _provider_payment_id text,
  _status text,
  _amount_cents integer,
  _currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.appointments%rowtype;
  payment_row public.payments%rowtype;
  mapped_status public.payment_status;
  previous_status public.payment_status;
  appointment_result text := 'unchanged';
begin
  if _provider_payment_id is null or _amount_cents < 0 or upper(coalesce(_currency, '')) <> 'BRL' then
    raise exception 'Invalid payment details.' using errcode = '22023';
  end if;

  select * into appointment_row
  from public.appointments as appointment
  where appointment.id = _appointment_id
  for update;
  if not found then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;

  select * into payment_row
  from public.payments as payment
  where payment.barbershop_id = appointment_row.barbershop_id
    and payment.appointment_id = appointment_row.id
    and payment.provider = 'mercado_pago'
  for update;
  if not found then
    raise exception 'Payment intent not found.' using errcode = 'P0002';
  end if;
  if payment_row.amount_cents <> _amount_cents then
    raise exception 'Payment amount does not match the appointment.' using errcode = '22023';
  end if;
  if payment_row.provider_payment_id is not null
     and payment_row.provider_payment_id <> _provider_payment_id then
    raise exception 'A different provider payment is already attached.' using errcode = '23505';
  end if;

  mapped_status := case lower(_status)
    when 'approved' then 'approved'::public.payment_status
    when 'rejected' then 'rejected'::public.payment_status
    when 'refunded' then 'refunded'::public.payment_status
    when 'charged_back' then 'refunded'::public.payment_status
    when 'cancelled' then 'cancelled'::public.payment_status
    else 'pending'::public.payment_status
  end;
  previous_status := payment_row.status;
  -- Ignore stale pending/rejected notifications after a payment was approved.
  if previous_status in ('refunded', 'cancelled') then
    mapped_status := previous_status;
  elsif previous_status = 'approved' and mapped_status not in ('refunded', 'cancelled') then
    mapped_status := previous_status;
  end if;

  update public.payments as payment
  set provider_payment_id = _provider_payment_id,
      status = mapped_status,
      raw_status = _status,
      approved_at = case when mapped_status = 'approved' then coalesce(payment.approved_at, now()) else payment.approved_at end
  where payment.id = payment_row.id;

  if mapped_status = 'approved' and appointment_row.status = 'pending'
     and appointment_row.hold_expires_at > now() then
    update public.appointments set status = 'confirmed' where id = appointment_row.id;
    insert into public.appointment_events (barbershop_id, appointment_id, event_type, details)
    values (appointment_row.barbershop_id, appointment_row.id, 'payment_approved',
      jsonb_build_object('provider_payment_id', _provider_payment_id));
    appointment_result := 'confirmed';
  elsif mapped_status = 'approved' and appointment_row.status <> 'confirmed' then
    if previous_status <> 'approved' then
      insert into public.appointment_events (barbershop_id, appointment_id, event_type, details)
      values (appointment_row.barbershop_id, appointment_row.id, 'payment_approved_after_hold',
        jsonb_build_object('provider_payment_id', _provider_payment_id, 'appointment_status', appointment_row.status));
    end if;
    appointment_result := 'manual_review';
  elsif mapped_status in ('refunded', 'cancelled') and appointment_row.status in ('pending', 'confirmed') then
    update public.appointments set status = 'cancelled' where id = appointment_row.id;
    insert into public.appointment_events (barbershop_id, appointment_id, event_type, details)
    values (appointment_row.barbershop_id, appointment_row.id, 'payment_cancelled_or_refunded',
      jsonb_build_object('provider_payment_id', _provider_payment_id, 'payment_status', mapped_status));
    appointment_result := 'cancelled';
  elsif previous_status <> mapped_status then
    insert into public.appointment_events (barbershop_id, appointment_id, event_type, details)
    values (appointment_row.barbershop_id, appointment_row.id, 'payment_status_changed',
      jsonb_build_object('provider_payment_id', _provider_payment_id, 'payment_status', mapped_status, 'raw_status', _status));
  end if;

  return appointment_result;
end;
$$;

revoke all on function public.claim_payment_checkout(uuid) from public, anon, authenticated;
revoke all on function public.finish_payment_checkout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_payment_checkout(uuid) from public, anon, authenticated;
revoke all on function public.sync_mercado_pago_payment(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.claim_payment_checkout(uuid) to service_role;
grant execute on function public.finish_payment_checkout(uuid, text, text) to service_role;
grant execute on function public.release_payment_checkout(uuid) to service_role;
grant execute on function public.sync_mercado_pago_payment(uuid, text, text, integer, text) to service_role;
