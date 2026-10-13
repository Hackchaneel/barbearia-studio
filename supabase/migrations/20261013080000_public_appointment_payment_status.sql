-- Expose only the minimum appointment/payment status needed by the public
-- Mercado Pago return page. The appointment UUID is an unguessable lookup key;
-- customer contact details and internal payment/provider data are never returned.
create or replace function public.get_public_appointment_status(_appointment_id uuid)
returns table (
  service_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  appointment_state text,
  payment_state text,
  amount_cents integer,
  hold_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select service.name,
         appointment.starts_at,
         appointment.ends_at,
         appointment.status::text,
         payment.status::text,
         appointment.amount_cents,
         appointment.hold_expires_at
  from public.appointments as appointment
  join public.services as service
    on service.barbershop_id = appointment.barbershop_id
   and service.id = appointment.service_id
  left join public.payments as payment
    on payment.barbershop_id = appointment.barbershop_id
   and payment.appointment_id = appointment.id
  where appointment.id = _appointment_id
  limit 1;
$$;

revoke all on function public.get_public_appointment_status(uuid) from public;
grant execute on function public.get_public_appointment_status(uuid) to anon, authenticated;
