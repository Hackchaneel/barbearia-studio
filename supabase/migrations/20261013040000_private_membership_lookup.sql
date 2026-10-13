-- Return only the signed-in user's active shop memberships without granting
-- browser clients direct SELECT access to the private user_id column.
create or replace function public.get_my_barbershop_memberships()
returns table (
  id uuid,
  barbershop_id uuid,
  role public.member_role,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select member.id, member.barbershop_id, member.role, member.display_name
  from public.barbershop_members as member
  where member.user_id = (select auth.uid())
    and member.is_active;
$$;

revoke all on function public.get_my_barbershop_memberships() from public, anon, authenticated;
grant execute on function public.get_my_barbershop_memberships() to authenticated;
