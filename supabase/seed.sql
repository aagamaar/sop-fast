-- ============================================================================
-- SEED: Bootstrap your single restaurant
-- ============================================================================
-- Run this AFTER you've created your manager user in Supabase Auth dashboard.
-- 
-- HOW TO USE:
-- 1. Go to Supabase Dashboard → Authentication → Users → Add User
-- 2. Create the manager with email: 9000000001@sopfast.app, password: your_choice
--    (use the format <phone>@sopfast.app — see ARCHITECTURE.md for why)
-- 3. Copy the user's UUID from the dashboard
-- 4. Replace MANAGER_USER_UUID below with that UUID
-- 5. Run this file in the Supabase SQL editor
-- ============================================================================

-- Step 1: create the restaurant
insert into restaurants (id, name, city)
values (
  '11111111-1111-1111-1111-111111111111',
  'One Bite',  -- ← change this to your restaurant's name
  'Thiruvananthapuram'  -- ← change this to your city
)
on conflict (id) do nothing;

-- Step 2: link the manager auth user to the restaurant via profiles
-- IMPORTANT: replace the id below with the UUID from Supabase Auth
insert into profiles (id, restaurant_id, role, full_name, phone)
values (
  'a238c5c9-3bb0-4c0b-acf0-888396f85a89',  -- ← REPLACE with auth.users UUID
  '11111111-1111-1111-1111-111111111111',
  'manager',
  'Shankar Saji',  -- ← change this to your manager's name
  '9000000005'   -- ← change this to your manager's phone
);
