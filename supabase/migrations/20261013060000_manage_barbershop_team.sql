-- Secure team operations. Staff can be linked only to an already-confirmed
-- Supabase Auth account; managers cannot grant owner or manager roles.
create or replace function public.add_barbershop_barber(
  _barbershop_id uuid,
  _email text,
  _display_name text,
  _bio text default '',
  _is_public boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_member_id uuid;
  existing_role public.member_role;
begin
  if not public.has_shop_role(_barbershop_id, array['owner','manager']::public.member_role[]) then
    raise exception 'You do not have permission to manage this team.' using errcode = '42501';
  end if;

  select account.id into target_user_id
  from auth.users as account
  where lower(account.email) = lower(trim(_email))
    and account.email_confirmed_at is not null
  limit 1;

  if target_user_id is null then
    raise exception 'No confirmed account uses this email. Ask the professional to register and confirm their email first.' using errcode = 'P0002';
  end if;

  select member.id, member.role into target_member_id, existing_role
  from public.barbershop_members as member
  where member.barbershop_id = _barbershop_id and member.user_id = target_user_id;

  if target_member_id is not null and existing_role <> 'barber' then
    raise exception 'This account already has a different role in this shop.' using errcode = '23505';
  end if;

  if target_member_id is null then
    insert into public.barbershop_members (
      barbershop_id, user_id, role, display_name, bio, is_public, is_active
    ) values (
      _barbershop_id, target_user_id, 'barber', trim(_display_name), coalesce(trim(_bio), ''), coalesce(_is_public, true), true
    ) returning id into target_member_id;
  else
    update public.barbershop_members
    set display_name = trim(_display_name),
        bio = coalesce(trim(_bio), ''),
        is_public = coalesce(_is_public, true),
        is_active = true
    where id = target_member_id;
  end if;

  return target_member_id;
end;
$$;

create or replace function public.update_barbershop_barber(
  _barbershop_id uuid,
  _barber_member_id uuid,
  _display_name text,
  _bio text,
  _avatar_url text,
  _is_public boolean,
  _is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_shop_role(_barbershop_id, array['owner','manager']::public.member_role[]) then
    raise exception 'You do not have permission to manage this team.' using errcode = '42501';
  end if;

  update public.barbershop_members as member
  set display_name = trim(_display_name),
      bio = coalesce(trim(_bio), ''),
      avatar_url = nullif(trim(_avatar_url), ''),
      is_public = coalesce(_is_public, false),
      is_active = coalesce(_is_active, false)
  where member.id = _barber_member_id
    and member.barbershop_id = _barbershop_id
    and member.role = 'barber';

  if not found then
    raise exception 'Professional not found in this shop.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.replace_barber_services(
  _barbershop_id uuid,
  _barber_member_id uuid,
  _service_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_service_ids uuid[] := coalesce(_service_ids, '{}'::uuid[]);
begin
  if not public.has_shop_role(_barbershop_id, array['owner','manager']::public.member_role[]) then
    raise exception 'You do not have permission to manage this team.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.barbershop_members as member
    where member.id = _barber_member_id
      and member.barbershop_id = _barbershop_id
      and member.role = 'barber'
  ) then
    raise exception 'Professional not found in this shop.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from unnest(selected_service_ids) as selected(id)
    left join public.services as service
      on service.id = selected.id
     and service.barbershop_id = _barbershop_id
     and service.is_active
    where service.id is null
  ) then
    raise exception 'Every selected service must be active and belong to this shop.' using errcode = '22023';
  end if;

  delete from public.barber_services as offering
  where offering.barbershop_id = _barbershop_id
    and offering.barber_member_id = _barber_member_id;

  insert into public.barber_services (barbershop_id, barber_member_id, service_id)
  select _barbershop_id, _barber_member_id, selected.id
  from unnest(selected_service_ids) as selected(id);
end;
$$;

revoke all on function public.add_barbershop_barber(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.update_barbershop_barber(uuid, uuid, text, text, text, boolean, boolean) from public, anon;
revoke all on function public.replace_barber_services(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.add_barbershop_barber(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.update_barbershop_barber(uuid, uuid, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.replace_barber_services(uuid, uuid, uuid[]) to authenticated;
