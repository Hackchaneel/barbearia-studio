-- Only a shop owner may grant the manager role. A manager can still manage
-- barber staff, services, and shop settings through the existing policies.
create or replace function public.add_barbershop_manager(
  _barbershop_id uuid,
  _email text,
  _display_name text
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
  clean_name text := trim(coalesce(_display_name, ''));
begin
  if not public.has_shop_role(_barbershop_id, array['owner']::public.member_role[]) then
    raise exception 'Only the shop owner can grant manager access.' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(_email, '')), '') is null
    or nullif(clean_name, '') is null
    or length(clean_name) > 80 then
    raise exception 'A valid email and a name of up to 80 characters are required.' using errcode = '22023';
  end if;

  select account.id into target_user_id
  from auth.users as account
  where lower(account.email) = lower(trim(_email))
    and account.email_confirmed_at is not null
  limit 1;

  if target_user_id is null then
    raise exception 'No confirmed account uses this email. The person must register and confirm their email first.' using errcode = 'P0002';
  end if;

  select member.id, member.role into target_member_id, existing_role
  from public.barbershop_members as member
  where member.barbershop_id = _barbershop_id
    and member.user_id = target_user_id;

  if existing_role = 'owner' then
    raise exception 'This account is already the shop owner.' using errcode = '23505';
  end if;

  if target_member_id is null then
    insert into public.barbershop_members (
      barbershop_id, user_id, role, display_name, bio, is_public, is_active
    ) values (
      _barbershop_id, target_user_id, 'manager', clean_name, '', false, true
    ) returning id into target_member_id;
  else
    if existing_role = 'barber' then
      delete from public.barber_services
      where barbershop_id = _barbershop_id and barber_member_id = target_member_id;

      delete from public.business_hours
      where barbershop_id = _barbershop_id and barber_member_id = target_member_id;
    end if;

    update public.barbershop_members
    set role = 'manager',
        display_name = clean_name,
        bio = '',
        is_public = false,
        is_active = true
    where id = target_member_id and barbershop_id = _barbershop_id;
  end if;

  return target_member_id;
end;
$$;

revoke all on function public.add_barbershop_manager(uuid, text, text) from public, anon;
grant execute on function public.add_barbershop_manager(uuid, text, text) to authenticated;
