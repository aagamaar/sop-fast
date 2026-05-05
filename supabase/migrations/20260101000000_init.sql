-- ============================================================================
-- SOP-Fast: Initial schema
-- Single restaurant SOP management with role-based access control.
-- ============================================================================

-- ============================================================================
-- TABLES
-- ============================================================================

-- One row per restaurant. v1 has exactly one row, but the schema is multi-tenant
-- ready so we can scale later without rewrites.
create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  created_at timestamptz default now()
);

-- Links a Supabase auth.users row to a role + restaurant.
-- We use phone-as-fake-email auth (e.g. 9000000010@sopfast.app), so phone
-- is what the user actually types when logging in.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  role text not null check (role in ('manager', 'worker')),
  full_name text not null,
  phone text not null unique,
  worker_role text, -- e.g. "Line cook", "Server" — only meaningful for workers
  created_at timestamptz default now()
);

create index profiles_restaurant_idx on profiles(restaurant_id);
create index profiles_role_idx on profiles(role);

-- A standard operating procedure. Steps are stored as JSONB for simplicity
-- (small, always read together, never queried independently).
create table sops (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  title text not null,
  description text,
  type text not null check (type in ('recurring', 'onetime')),
  steps jsonb not null default '[]'::jsonb,
  -- shape: [{ id: text, text: text, requirePhoto: boolean }]
  archived boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index sops_restaurant_idx on sops(restaurant_id);

-- Many-to-many: which workers a given SOP is assigned to.
create table sop_assignments (
  sop_id uuid references sops(id) on delete cascade,
  worker_id uuid references profiles(id) on delete cascade,
  assigned_at timestamptz default now(),
  primary key (sop_id, worker_id)
);

create index sop_assignments_worker_idx on sop_assignments(worker_id);

-- One row per (sop, worker, day). For one-time SOPs, day_key is always 'once'.
-- For recurring SOPs, day_key is YYYY-MM-DD in the restaurant's local timezone.
-- step_completions stores per-step progress: { stepId: { done, photo_url, ts } }
create table completions (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid references sops(id) on delete cascade not null,
  worker_id uuid references profiles(id) on delete cascade not null,
  day_key text not null,
  step_completions jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (sop_id, worker_id, day_key)
);

create index completions_sop_idx on completions(sop_id);
create index completions_worker_idx on completions(worker_id);
create index completions_day_idx on completions(day_key);

-- Auto-update updated_at on completions
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger completions_set_updated_at
  before update on completions
  for each row execute function set_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS for RLS
-- ============================================================================

-- Returns the restaurant_id of the currently logged-in user.
-- Marked stable so Postgres can cache it within a query.
create or replace function current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select restaurant_id from profiles where id = auth.uid()
$$;

-- Returns the role ('manager' | 'worker' | null) of the current user.
create or replace function current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table restaurants enable row level security;
alter table profiles enable row level security;
alter table sops enable row level security;
alter table sop_assignments enable row level security;
alter table completions enable row level security;

-- restaurants: anyone in the restaurant can read it; nobody can modify via API
-- (admin does that out-of-band via SQL or service role)
create policy "members can read their restaurant" on restaurants
  for select using (id = current_restaurant_id());

-- profiles: members can see other members of the same restaurant.
-- Workers can update their own profile (e.g. change password later).
-- Managers can insert/update/delete worker profiles in their restaurant.
create policy "members can read profiles in their restaurant" on profiles
  for select using (restaurant_id = current_restaurant_id());

create policy "managers can create workers in their restaurant" on profiles
  for insert with check (
    current_user_role() = 'manager'
    and restaurant_id = current_restaurant_id()
    and role = 'worker'
  );

create policy "managers can update workers in their restaurant" on profiles
  for update using (
    current_user_role() = 'manager'
    and restaurant_id = current_restaurant_id()
    and role = 'worker'
  );

create policy "managers can delete workers in their restaurant" on profiles
  for delete using (
    current_user_role() = 'manager'
    and restaurant_id = current_restaurant_id()
    and role = 'worker'
  );

-- sops: members can read SOPs in their restaurant. Managers can write.
create policy "members can read sops in their restaurant" on sops
  for select using (restaurant_id = current_restaurant_id());

create policy "managers can insert sops" on sops
  for insert with check (
    current_user_role() = 'manager'
    and restaurant_id = current_restaurant_id()
  );

create policy "managers can update sops" on sops
  for update using (
    current_user_role() = 'manager'
    and restaurant_id = current_restaurant_id()
  );

create policy "managers can delete sops" on sops
  for delete using (
    current_user_role() = 'manager'
    and restaurant_id = current_restaurant_id()
  );

-- sop_assignments: managers manage them; workers can see their own.
create policy "members can read assignments in their restaurant" on sop_assignments
  for select using (
    exists (
      select 1 from sops where sops.id = sop_assignments.sop_id
        and sops.restaurant_id = current_restaurant_id()
    )
  );

create policy "managers can manage assignments" on sop_assignments
  for all using (
    current_user_role() = 'manager'
    and exists (
      select 1 from sops where sops.id = sop_assignments.sop_id
        and sops.restaurant_id = current_restaurant_id()
    )
  );

-- completions: workers can read/write their own. Managers can read all in their restaurant.
create policy "workers can read their completions" on completions
  for select using (
    worker_id = auth.uid()
    or (
      current_user_role() = 'manager'
      and exists (
        select 1 from profiles
        where profiles.id = completions.worker_id
          and profiles.restaurant_id = current_restaurant_id()
      )
    )
  );

create policy "workers can insert their completions" on completions
  for insert with check (worker_id = auth.uid());

create policy "workers can update their completions" on completions
  for update using (worker_id = auth.uid());

-- ============================================================================
-- REAL-TIME
-- ============================================================================
-- Enable real-time on completions so manager dashboards live-update
-- when workers tick off steps.
alter publication supabase_realtime add table completions;

-- ============================================================================
-- STORAGE: photo proof bucket
-- ============================================================================
-- Run this in the Supabase dashboard (Storage section) OR via SQL:
insert into storage.buckets (id, name, public)
values ('sop-photos', 'sop-photos', false)
on conflict (id) do nothing;

-- Storage policies: workers can upload/read their own photos.
-- Managers can read all photos from their restaurant's workers.
-- Path convention: {worker_id}/{sop_id}/{step_id}/{timestamp}.jpg

create policy "workers can upload their own photos"
  on storage.objects for insert
  with check (
    bucket_id = 'sop-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "workers can read their own photos"
  on storage.objects for select
  using (
    bucket_id = 'sop-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "managers can read photos from their restaurant"
  on storage.objects for select
  using (
    bucket_id = 'sop-photos'
    and current_user_role() = 'manager'
    and exists (
      select 1 from profiles
      where profiles.id::text = (storage.foldername(name))[1]
        and profiles.restaurant_id = current_restaurant_id()
    )
  );
