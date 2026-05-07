-- =====================================================================
-- Security hardening based on Supabase Security Advisor
-- =====================================================================

-- set_updated_at: trigger function, doesn't need elevated privileges
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

-- Helper functions for RLS — SECURITY DEFINER is required so they can
-- read public.profiles regardless of the calling user's RLS scope.
-- They only return the calling user's own data via auth.uid(), so they
-- cannot leak other users' data.
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

-- Restrict the SECURITY DEFINER helpers to authenticated callers only.
-- The Security Advisor will still flag these (false positive — linter
-- doesn't track that they only return the caller's own data), but the
-- access pattern is sound.
revoke execute on function current_restaurant_id() from public, anon;
revoke execute on function current_user_role() from public, anon;
grant execute on function current_restaurant_id() to authenticated;
grant execute on function current_user_role() to authenticated;