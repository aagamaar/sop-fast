-- =====================================================================
-- Security hardening pass
-- =====================================================================
-- Addresses warnings raised by Supabase's Security Advisor (splinter).
-- See ARCHITECTURE.md → "Security posture" for the full reasoning.
-- =====================================================================

-- ---------------------------------------------------------------------
-- set_updated_at: trigger function for the completions table.
-- Switched from SECURITY DEFINER to SECURITY INVOKER — it only mutates
-- the row being updated, so it doesn't need elevated privileges.
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS helper functions: must be SECURITY DEFINER so they can read
-- public.profiles regardless of the caller's RLS scope. They only
-- ever return the calling user's own data (via auth.uid()), so they
-- cannot be used to leak another user's data.
--
-- The Security Advisor will continue to flag these as "SECURITY DEFINER
-- callable by signed-in users" — this is a known false positive for our
-- access pattern. The functions are restricted to authenticated callers
-- only via the grants below.
-- ---------------------------------------------------------------------
create or replace function current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select restaurant_id from public.profiles where id = auth.uid()
$$;

create or replace function current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Lock execution down to authenticated users only
revoke execute on function current_restaurant_id() from public, anon;
revoke execute on function current_user_role() from public, anon;
grant execute on function current_restaurant_id() to authenticated;
grant execute on function current_user_role() to authenticated;