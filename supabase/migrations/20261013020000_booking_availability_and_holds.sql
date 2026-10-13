-- Server-side slot calculation and temporary appointment holds.
-- Public clients may read availability; only the Edge Function's service role
-- can create a hold. The exclusion constraint remains the final concurrency guard.

alter table public.appointments
  add column buffer_minutes integer not null default 0
    check (buffer_minutes between 0 and 240);

alter table public.appointments
  add column slot_ends_at timestamptz;

-- timestamptz + interval is not immutable in PostgreSQL, so this value must
-- be maintained by a trigger instead of a generated column.
create or replace function public.set_appointment_slot_ends_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.slot_ends_at := new.ends_at + make_interval(secs => new.buffer_minutes * 60);
  return new;
end;
$$;

create trigger set_appointment_slot_ends_at
  before insert or update on public.appointments
  for each row execute function public.set_appointment_slot_ends_at();

update public.appointments
set slot_ends_at = ends_at + make_interval(secs => buffer_minutes * 60);

alter table public.appointments
  alter column slot_ends_at set not null;

alter table public.appointments
  drop constraint appointments_no_active_overlap;

alter table public.appointments
  add constraint appointments_no_active_overlap
  exclude using gist (
    barbershop_id with =,
    barber_member_id with =,
    tstzrange(starts_at, slot_ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'));

create or replace function public.get_available_slots(
  _barbershop_id uuid,
  _service_id uuid,
  _date date,
  _barber_member_id uuid default null
)
returns table (
  barber_member_id uuid,
  barber_name text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with shop_service as (
    select shop.id as shop_id,
           shop.timezone,
           service.id as service_id,
           service.duration_minutes,
           service.buffer_minutes
    from public.barbershops as shop
    join public.services as service
      on service.barbershop_id = shop.id
    where shop.id = _barbershop_id
      and shop.is_active
      and service.id = _service_id
      and service.is_active
  ), candidates as (
    select member.id as member_id,
           member.display_name,
           shop_service.timezone,
           shop_service.duration_minutes,
           shop_service.buffer_minutes,
           hours.break_starts_at,
           hours.break_ends_at,
           slot.local_start
    from shop_service
    join public.barber_services as offering
      on offering.barbershop_id = shop_service.shop_id
     and offering.service_id = shop_service.service_id
    join public.barbershop_members as member
      on member.id = offering.barber_member_id
     and member.barbershop_id = shop_service.shop_id
     and member.role = 'barber'
     and member.is_active
     and member.is_public
    join lateral (
      select schedule.is_closed,
             schedule.opens_at,
             schedule.closes_at,
             schedule.break_starts_at,
             schedule.break_ends_at
      from public.business_hours as schedule
      where schedule.barbershop_id = shop_service.shop_id
        and schedule.weekday = extract(dow from _date)::smallint
        and (schedule.barber_member_id = member.id or schedule.barber_member_id is null)
      order by (schedule.barber_member_id is not null) desc
      limit 1
    ) as hours on not hours.is_closed
    cross join lateral generate_series(
      _date::timestamp + hours.opens_at,
      _date::timestamp + hours.closes_at
        - make_interval(mins => shop_service.duration_minutes + shop_service.buffer_minutes),
      interval '15 minutes'
    ) as slot(local_start)
    where (_barber_member_id is null or member.id = _barber_member_id)
  )
  select candidate.member_id as barber_member_id,
         candidate.display_name as barber_name,
         candidate.local_start at time zone candidate.timezone as starts_at,
         (candidate.local_start + make_interval(mins => candidate.duration_minutes))
           at time zone candidate.timezone as ends_at
  from candidates as candidate
  where (candidate.break_starts_at is null or candidate.break_ends_at is null
      or candidate.local_start >= _date::timestamp + candidate.break_ends_at
      or candidate.local_start + make_interval(mins => candidate.duration_minutes + candidate.buffer_minutes)
           <= _date::timestamp + candidate.break_starts_at)
    and candidate.local_start at time zone candidate.timezone > now()
    and not exists (
      select 1
      from public.blocked_times as blocked
      where blocked.barbershop_id = _barbershop_id
        and (blocked.barber_member_id is null or blocked.barber_member_id = candidate.member_id)
        and blocked.starts_at < (candidate.local_start + make_interval(mins => candidate.duration_minutes + candidate.buffer_minutes))
          at time zone candidate.timezone
        and blocked.ends_at > candidate.local_start at time zone candidate.timezone
    )
    and not exists (
      select 1
      from public.appointments as appointment
      where appointment.barbershop_id = _barbershop_id
        and appointment.barber_member_id = candidate.member_id
        and appointment.status in ('pending', 'confirmed')
        and (appointment.status <> 'pending'
          or appointment.hold_expires_at is null
          or appointment.hold_expires_at > now())
        and appointment.starts_at < (candidate.local_start + make_interval(mins => candidate.duration_minutes + candidate.buffer_minutes))
          at time zone candidate.timezone
        and appointment.slot_ends_at > candidate.local_start at time zone candidate.timezone
    )
  order by starts_at, barber_name;
$$;

revoke all on function public.get_available_slots(uuid, uuid, date, uuid) from public;
grant execute on function public.get_available_slots(uuid, uuid, date, uuid) to anon, authenticated;

create or replace function public.create_appointment_hold(
  _barbershop_id uuid,
  _service_id uuid,
  _barber_member_id uuid,
  _starts_at timestamptz,
  _customer_name text,
  _customer_phone text,
  _customer_email text default null
)
returns table (
  appointment_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  hold_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_row public.services%rowtype;
  shop_row public.barbershops%rowtype;
  local_date date;
  appointment_uuid uuid;
  service_end timestamptz;
  expiry timestamptz;
begin
  if length(trim(coalesce(_customer_name, ''))) not between 2 and 120
     or length(regexp_replace(coalesce(_customer_phone, ''), '[^0-9]', '', 'g')) not between 10 and 15
     or (_customer_email is not null and length(_customer_email) > 254) then
    raise exception 'Invalid customer details.' using errcode = '22023';
  end if;

  select * into shop_row
  from public.barbershops as shop
  where shop.id = _barbershop_id and shop.is_active;
  if not found then
    raise exception 'Barbershop not found.' using errcode = 'P0002';
  end if;

  select * into service_row
  from public.services as service
  where service.id = _service_id
    and service.barbershop_id = _barbershop_id
    and service.is_active;
  if not found then
    raise exception 'Service not found.' using errcode = 'P0002';
  end if;

  local_date := (_starts_at at time zone shop_row.timezone)::date;

  if not exists (
    select 1
    from public.get_available_slots(_barbershop_id, _service_id, local_date, _barber_member_id) as available
    where available.barber_member_id = _barber_member_id
      and available.starts_at = _starts_at
  ) then
    raise exception 'The selected time is no longer available.' using errcode = '23P01';
  end if;

  -- Expired pending rows are transitioned before inserting. Availability ignores
  -- expired holds too, while this update releases their exclusion ranges.
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

  service_end := _starts_at + make_interval(mins => service_row.duration_minutes);
  expiry := now() + make_interval(mins => shop_row.reservation_minutes);

  insert into public.appointments (
    barbershop_id, service_id, barber_member_id,
    customer_name, customer_phone, customer_email,
    starts_at, ends_at, buffer_minutes, status, amount_cents, hold_expires_at
  ) values (
    _barbershop_id, _service_id, _barber_member_id,
    trim(_customer_name), trim(_customer_phone), nullif(trim(coalesce(_customer_email, '')), ''),
    _starts_at, service_end, service_row.buffer_minutes, 'pending', service_row.price_cents, expiry
  ) returning id into appointment_uuid;

  insert into public.appointment_events (barbershop_id, appointment_id, event_type, details)
  values (_barbershop_id, appointment_uuid, 'hold_created', jsonb_build_object('expires_at', expiry));

  return query select appointment_uuid, _starts_at, service_end, expiry;
end;
$$;

revoke all on function public.create_appointment_hold(uuid, uuid, uuid, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.create_appointment_hold(uuid, uuid, uuid, timestamptz, text, text, text) to service_role;
