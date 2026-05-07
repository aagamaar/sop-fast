-- Fix: pin search_path on all helper functions
create or replace function set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

-- Restrict execution to signed-in users only
revoke execute on function current_restaurant_id() from public, anon;
revoke execute on function current_user_role() from public, anon;
grant execute on function current_restaurant_id() to authenticated;
grant execute on function current_user_role() to authenticated;