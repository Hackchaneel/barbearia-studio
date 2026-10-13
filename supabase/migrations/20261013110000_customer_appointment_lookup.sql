-- Public customer lookup requires both the unguessable appointment UUID and
-- the phone number supplied at booking. Return no customer contact details.
create or replace function public.lookup_customer_appointment(
  _appointment_id uuid,
  _customer_phone text
)
returns table (
  service_name text,
  barber_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  appointment_state text,
  payment_state text,
  amount_cents integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select service.name,
         member.display_name,
         appointment.starts_at,
         appointment.ends_at,
         appointment.status::text,
         payment.status::text,
         appointment.amount_cents
  from public.appointments as appointment
  join public.services as service
    on service.barbershop_id = appointment.barbershop_id
   and service.id = appointment.service_id
  join public.barbershop_members as member
    on member.barbershop_id = appointment.barbershop_id
   and member.id = appointment.barber_member_id
  left join public.payments as payment
    on payment.barbershop_id = appointment.barbershop_id
   and payment.appointment_id = appointment.id
  where appointment.id = _appointment_id
    and length(regexp_replace(coalesce(_customer_phone, ''), '[^0-9]', '', 'g')) between 10 and 15
    and regexp_replace(appointment.customer_phone, '[^0-9]', '', 'g')
      = regexp_replace(_customer_phone, '[^0-9]', '', 'g')
  limit 1;
$$;

revoke all on function public.lookup_customer_appointment(uuid, text) from public;
grant execute on function public.lookup_customer_appointment(uuid, text) to anon, authenticated;
