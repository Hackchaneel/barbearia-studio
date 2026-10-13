-- Initial multi-tenant schema for Noir Barbearia.
-- Roles for staff live in barbershop_members, never in user-editable auth metadata.
create extension if not exists btree_gist with schema extensions;

create type public.member_role as enum ('owner', 'manager', 'barber');
create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'expired');
create type public.payment_status as enum ('pending', 'approved', 'rejected', 'refunded', 'cancelled');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.barbershops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  logo_url text,
  phone text,
  email text,
  address_line text,
  city text,
  state text,
  postal_code text,
  timezone text not null default 'America/Sao_Paulo',
  cancellation_policy text not null default '',
  reservation_minutes integer not null default 10 check (reservation_minutes between 1 and 120),
  theme jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.barbershop_members (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  is_public boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barbershop_id, user_id),
  unique (barbershop_id, id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barbershop_id, id)
);

create table public.barber_services (
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_member_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (barbershop_id, barber_member_id, service_id),
  foreign key (barbershop_id, barber_member_id)
    references public.barbershop_members(barbershop_id, id) on delete cascade,
  foreign key (barbershop_id, service_id)
    references public.services(barbershop_id, id) on delete cascade
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_member_id uuid,
  weekday smallint not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  break_starts_at time,
  break_ends_at time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (barbershop_id, barber_member_id)
    references public.barbershop_members(barbershop_id, id) on delete cascade,
  check (is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at)),
  check ((break_starts_at is null and break_ends_at is null) or
         (break_starts_at is not null and break_ends_at is not null and break_ends_at > break_starts_at)),
  unique nulls not distinct (barbershop_id, barber_member_id, weekday)
);

create table public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_member_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (barbershop_id, barber_member_id)
    references public.barbershop_members(barbershop_id, id) on delete cascade,
  check (ends_at > starts_at)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  service_id uuid not null,
  barber_member_id uuid not null,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'pending',
  amount_cents integer not null check (amount_cents >= 0),
  hold_expires_at timestamptz,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (barbershop_id, service_id)
    references public.services(barbershop_id, id) on delete restrict,
  foreign key (barbershop_id, barber_member_id)
    references public.barbershop_members(barbershop_id, id) on delete restrict,
  check (ends_at > starts_at),
  unique (barbershop_id, id)
);

-- Database-level protection against concurrent overlapping reservations for a barber.
-- Expired pending holds must be transitioned to `expired` by the backend cleanup job.
alter table public.appointments
  add constraint appointments_no_active_overlap
  exclude using gist (
    barbershop_id with =,
    barber_member_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  appointment_id uuid not null,
  provider text not null default 'mercado_pago',
  provider_payment_id text,
  idempotency_key text not null unique,
  status public.payment_status not null default 'pending',
  amount_cents integer not null check (amount_cents >= 0),
  currency char(3) not null default 'BRL',
  approved_at timestamptz,
  raw_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (barbershop_id, appointment_id)
    references public.appointments(barbershop_id, id) on delete restrict,
  unique (provider, provider_payment_id)
);

create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete restrict,
  appointment_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (barbershop_id, appointment_id)
    references public.appointments(barbershop_id, id) on delete cascade
);

create index barbershop_members_user_idx on public.barbershop_members(user_id, is_active);
create index services_shop_active_idx on public.services(barbershop_id, is_active, sort_order);
create index business_hours_lookup_idx on public.business_hours(barbershop_id, barber_member_id, weekday);
create index blocked_times_lookup_idx on public.blocked_times(barbershop_id, starts_at, ends_at);
create index appointments_shop_start_idx on public.appointments(barbershop_id, starts_at);
create index appointments_customer_idx on public.appointments(customer_user_id, starts_at desc);
create index payments_appointment_idx on public.payments(appointment_id, created_at desc);
create index appointment_events_appointment_idx on public.appointment_events(appointment_id, created_at desc);

create or replace function public.assert_barber_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.barber_member_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.barbershop_members as member
    where member.id = new.barber_member_id
      and member.barbershop_id = new.barbershop_id
      and member.role = 'barber'
      and member.is_active
  ) then
    raise exception 'The selected member is not an active barber in this barbershop.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.assert_barber_member() from public, anon, authenticated;

create or replace function public.has_shop_role(_barbershop_id uuid, _roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barbershop_members as member
    where member.barbershop_id = _barbershop_id
      and member.user_id = (select auth.uid())
      and member.is_active
      and member.role = any(_roles)
  );
$$;
revoke all on function public.has_shop_role(uuid, public.member_role[]) from public, anon;
grant execute on function public.has_shop_role(uuid, public.member_role[]) to anon, authenticated;

create or replace function public.is_current_barber(_barbershop_id uuid, _member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.barbershop_members as member
    where member.barbershop_id = _barbershop_id
      and member.id = _member_id
      and member.user_id = (select auth.uid())
      and member.role = 'barber'
      and member.is_active
  );
$$;
revoke all on function public.is_current_barber(uuid, uuid) from public, anon;
grant execute on function public.is_current_barber(uuid, uuid) to authenticated;
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create trigger ensure_barber_service_member before insert or update on public.barber_services
  for each row execute procedure public.assert_barber_member();
create trigger ensure_business_hours_barber before insert or update on public.business_hours
  for each row execute procedure public.assert_barber_member();
create trigger ensure_blocked_times_barber before insert or update on public.blocked_times
  for each row execute procedure public.assert_barber_member();
create trigger ensure_appointment_barber before insert or update on public.appointments
  for each row execute procedure public.assert_barber_member();

create trigger set_barbershops_updated_at before update on public.barbershops
  for each row execute procedure public.set_updated_at();
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger set_members_updated_at before update on public.barbershop_members
  for each row execute procedure public.set_updated_at();
create trigger set_services_updated_at before update on public.services
  for each row execute procedure public.set_updated_at();
create trigger set_business_hours_updated_at before update on public.business_hours
  for each row execute procedure public.set_updated_at();
create trigger set_appointments_updated_at before update on public.appointments
  for each row execute procedure public.set_updated_at();
create trigger set_payments_updated_at before update on public.payments
  for each row execute procedure public.set_updated_at();

alter table public.barbershops enable row level security;
alter table public.profiles enable row level security;
alter table public.barbershop_members enable row level security;
alter table public.services enable row level security;
alter table public.barber_services enable row level security;
alter table public.business_hours enable row level security;
alter table public.blocked_times enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.appointment_events enable row level security;

-- Public reads are limited to information used by the public website.
create policy "Public can view active barbershops" on public.barbershops
  for select to anon, authenticated using (is_active or public.has_shop_role(id, array['owner','manager']::public.member_role[]));
create policy "Public can view active services" on public.services
  for select to anon, authenticated using (
    is_active and exists (select 1 from public.barbershops shop where shop.id = barbershop_id and shop.is_active)
    or public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[])
  );
create policy "Public can view barber service offerings" on public.barber_services
  for select to anon, authenticated using (
    exists (select 1 from public.services service where service.id = barber_services.service_id and service.barbershop_id = barber_services.barbershop_id and service.is_active)
    and exists (select 1 from public.barbershop_members member where member.id = barber_services.barber_member_id and member.barbershop_id = barber_services.barbershop_id and member.role = 'barber' and member.is_active and member.is_public)
    or public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[])
  );
create policy "Public can view active barber profiles" on public.barbershop_members
  for select to anon, authenticated using (
    (role = 'barber' and is_active and is_public and exists (select 1 from public.barbershops shop where shop.id = barbershop_id and shop.is_active))
    or user_id = (select auth.uid())
    or public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[])
  );
create policy "Public can view shop business hours" on public.business_hours
  for select to anon, authenticated using (
    (
      exists (select 1 from public.barbershops shop where shop.id = business_hours.barbershop_id and shop.is_active)
      and (
        business_hours.barber_member_id is null
        or exists (select 1 from public.barbershop_members member where member.id = business_hours.barber_member_id and member.barbershop_id = business_hours.barbershop_id and member.role = 'barber' and member.is_active and member.is_public)
      )
    )
    or public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[])
  );

-- Authenticated users can only read/update their own profile. No role lives on this row.
create policy "Users can view own profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users can update own profile" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Tenant staff can manage their own shop. Membership changes are server/admin-only.
create policy "Shop managers can update barbershop" on public.barbershops
  for update to authenticated using (public.has_shop_role(id, array['owner','manager']::public.member_role[]))
  with check (public.has_shop_role(id, array['owner','manager']::public.member_role[]));
create policy "Shop managers can manage services" on public.services
  for all to authenticated using (public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[]))
  with check (public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[]));
create policy "Shop managers can manage barber service offerings" on public.barber_services
  for all to authenticated using (public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[]))
  with check (public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[]));
create policy "Shop managers can manage business hours" on public.business_hours
  for all to authenticated using (public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[]))
  with check (public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[]));
create policy "Shop managers can manage blocked times" on public.blocked_times
  for all to authenticated using (public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[]))
  with check (public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[]));

create policy "Shop staff and customers can view their appointments" on public.appointments
  for select to authenticated using (
    public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[])
    or customer_user_id = (select auth.uid())
    or public.is_current_barber(appointments.barbershop_id, appointments.barber_member_id)
  );
-- Appointment writes are reserved for trusted Edge Functions. Browser clients cannot fake payment confirmation.

create policy "Shop managers and customers can view payments" on public.payments
  for select to authenticated using (
    public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[])
    or exists (select 1 from public.appointments appointment where appointment.id = appointment_id and appointment.customer_user_id = (select auth.uid()))
  );
create policy "Shop managers can view appointment events" on public.appointment_events
  for select to authenticated using (public.has_shop_role(barbershop_id, array['owner','manager']::public.member_role[]));

-- Start with no implicit access; grant only operations that have matching RLS policies.
revoke all on public.barbershops, public.profiles, public.barbershop_members, public.services,
  public.barber_services, public.business_hours, public.blocked_times, public.appointments,
  public.payments, public.appointment_events from anon, authenticated;
grant select on public.barbershops, public.services, public.barber_services, public.business_hours to anon, authenticated;
grant select (id, barbershop_id, role, display_name, bio, avatar_url, is_public, is_active)
  on public.barbershop_members to anon, authenticated;
grant select, update on public.barbershops to authenticated;
grant select, update (full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.services, public.barber_services,
  public.business_hours, public.blocked_times to authenticated;
grant select on public.appointments to authenticated;
grant select on public.payments, public.appointment_events to authenticated;






