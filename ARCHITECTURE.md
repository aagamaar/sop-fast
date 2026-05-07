# Architecture

This document explains the *why* behind SOP-Fast's structure, not just the *what*. If you want to understand the schema or extend the app, start here.

## Stack

| Layer       | Choice                       | Why                                                              |
| ----------- | ---------------------------- | ---------------------------------------------------------------- |
| Frontend    | Vite + React 18              | Authenticated tool, no SEO need. Single-page, fast iteration.    |
| Routing     | None (role-based switch)     | Three views, all behind auth. A router would be ceremony.        |
| Backend     | Supabase (Postgres + Auth + Storage + Realtime) | One service, four jobs. No backend code to write or host. |
| Auth        | Email/password (phone-as-email) | No SMS provider needed. See below.                            |
| File hosting| Supabase Storage             | Same auth context as the DB. RLS extends to objects.             |
| Hosting     | Vercel                       | Free, fast, auto-HTTPS, GitHub-integrated.                       |

## Database schema

Five tables. Every one has Row Level Security enabled.

### `restaurants`
```
id            uuid (pk)
name          text
city          text
created_at    timestamptz
```
v1 has one row. The schema is multi-tenant ready so v2 doesn't need a migration.

### `profiles`
```
id            uuid (pk, fk → auth.users.id)
restaurant_id uuid (fk → restaurants.id)
role          text ('manager' | 'worker')
full_name     text
phone         text (unique)
worker_role   text (nullable; e.g. "Line cook")
created_at    timestamptz
```
The bridge between Supabase Auth and the app's domain model. One row per real human. A user without a profile row can authenticate but can't see any data — RLS policies all reference `profiles`.

### `sops`
```
id            uuid (pk)
restaurant_id uuid (fk → restaurants.id)
title         text
description   text
type          text ('recurring' | 'onetime')
steps         jsonb  -- [{ id, text, requirePhoto }]
archived      boolean
created_by    uuid (fk → profiles.id)
created_at    timestamptz
```
Steps are stored as JSONB rather than as a separate `sop_steps` table. Reasoning: steps are always read/written together, never queried independently, and rarely number more than 20. JSONB is simpler and faster for this access pattern.

### `sop_assignments`
```
sop_id        uuid (fk → sops.id)
worker_id     uuid (fk → profiles.id)
assigned_at   timestamptz
PRIMARY KEY (sop_id, worker_id)
```
A junction table. One row per assignment. Deleting a worker cascades; deleting an SOP cascades.

### `completions`
```
id                uuid (pk)
sop_id            uuid (fk → sops.id)
worker_id         uuid (fk → profiles.id)
day_key           text  -- 'YYYY-MM-DD' for recurring, 'once' for one-time
step_completions  jsonb  -- { stepId: { done, photo_url, photo_path, ts } }
completed_at      timestamptz (nullable)
created_at        timestamptz
updated_at        timestamptz
UNIQUE (sop_id, worker_id, day_key)
```
The most important table operationally. The unique constraint prevents accidental duplicate completion rows when a worker double-taps a button.

`day_key` as text was chosen over a date type because (a) one-time SOPs use the literal string `'once'` and (b) string comparison and indexing is just fine here.

## Auth model

### Why fake-email auth

Supabase supports phone auth natively, but it requires a paid SMS provider (Twilio, MessageBird, etc.) — that's overkill for a v1 in one restaurant.

So instead: workers and managers log in with **phone number + password**, and the app converts the phone number to a fake email like `9000000010@sopfast.app` before calling Supabase Auth. The user never types or sees an email.

Trade-offs:

- ✅ Zero SMS cost. No provider to set up.
- ✅ Real password hashing, real session management — Supabase Auth handles all of it.
- ✅ Easy to migrate to real phone auth later: change the sign-up flow, keep everything else.
- ❌ No "magic link" or OTP recovery. If a worker forgets their password, the manager resets it manually in the Supabase dashboard. (Self-serve reset is on the roadmap once we add an SMS provider.)
- ❌ The `@sopfast.app` domain is a placeholder; emails sent to it will bounce. We never send any.

### Two-step worker creation

Creating a worker is two operations:

1. `auth.signUp` to create the auth user.
2. `INSERT INTO profiles` to link that user to the restaurant.

These aren't transactional from the client. If step 2 fails, you get an orphaned auth user. In practice this is rare, but it's a known v1 limitation. The fix is a Supabase Edge Function with the service role key that does both steps atomically — see [ROADMAP.md](./ROADMAP.md).

There's also a subtle quirk: `signUp` immediately signs the new user in, kicking the manager out of their session. The `createWorker` helper in `src/lib/api.js` saves the manager's session before signUp and restores it after. This works but is hacky — the Edge Function approach also fixes this.

## Row-level security

RLS is the single most important piece of this architecture. Every table has policies that scope reads and writes to the user's restaurant. Two helper functions make policies readable:

```sql
current_restaurant_id()   -- returns auth.uid()'s restaurant_id from profiles
current_user_role()       -- returns 'manager', 'worker', or null
```

Policies in plain English:

| Table             | Read                                    | Write                            |
| ----------------- | --------------------------------------- | -------------------------------- |
| `restaurants`     | Members of that restaurant              | Nobody (admin uses service role) |
| `profiles`        | Members of the same restaurant          | Managers can manage workers      |
| `sops`            | Members of the same restaurant          | Managers only                    |
| `sop_assignments` | Members of the same restaurant          | Managers only                    |
| `completions`     | Owner; managers see their restaurant's  | Owner only                       |

If you bypass the front-end entirely and hit the Supabase REST API with a worker's JWT, you still can't read another restaurant's data. **The database is the security boundary**, not the React app.

## Security posture and known advisor warnings

Supabase's Security Advisor (splinter) currently reports 5 warnings on
this project. They have all been reviewed; 4 are accepted false positives
for our access pattern, and 1 is gated behind a paid plan.

### Accepted: SECURITY DEFINER warnings on RLS helper functions

Three functions — `current_restaurant_id()`, `current_user_role()`, and
`set_updated_at()` — appear in 4 of the warnings. The advisor flags them
because:

1. They are marked `SECURITY DEFINER` (run with elevated privileges)
2. They are callable by signed-in users

For our setup this is correct, not a vulnerability:

- `current_restaurant_id()` and `current_user_role()` need `SECURITY DEFINER`
  to bypass RLS on `profiles` so they can resolve "what restaurant does this
  signed-in user belong to?" — which is exactly what every other RLS policy
  in the schema depends on.

- They take no arguments and only return the calling user's own data
  via `auth.uid()`. There is no input that could redirect them to read
  another user's data.

- `set_updated_at()` was changed from `SECURITY DEFINER` to `SECURITY INVOKER`
  in migration `20260507000000_security_hardening.sql` — it doesn't need
  elevated privileges, so the safer default is correct. The advisor still
  flags it because it pattern-matches on the function name; this can be
  ignored.

- All three functions have execution restricted to the `authenticated` role
  only (anonymous users cannot call them).

If this project ever expands to allow user-supplied filters or untrusted
input flowing into these functions, this assessment must be revisited.

### Accepted with constraint: Leaked Password Protection

The "Leaked Password Protection Disabled" warning refers to Supabase's
HaveIBeenPwned integration, which is gated behind the Pro plan
($25/month). This is acceptable for v1 because:

- All worker passwords are set by the manager, not self-served by the
  worker. The manager picks the password and communicates it directly.
- Password length minimum (6 characters) is enforced.
- The attack surface is minimal: workers can only access their own
  restaurant's data, and there is no admin role exposed via auth.

This warning will be addressed when the project upgrades to Pro, which
would coincide with self-serve password reset (currently on the roadmap).

## Storage

The `sop-photos` bucket is private. Path convention:

```
{worker_id}/{sop_id}/{step_id}/{timestamp}.{ext}
```

This makes RLS straightforward: a worker can only read/write paths starting with their own UUID; a manager can read paths whose first folder is a UUID belonging to a worker in their restaurant. The `getSignedUrl` API issues short-lived URLs (24h) for display.

Photos add up — a busy kitchen with 3 photo-proof steps per SOP and 5 SOPs per day generates about 450 photos a month. Free tier is 1GB. Plan for paid storage as you scale, or lower-resolution uploads.

## Real-time

Supabase Realtime publishes change events on the `completions` table. The manager dashboard subscribes:

```js
supabase.channel('manager-completions')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'completions' },
      () => loadCompletions())
  .subscribe();
```

Whenever a worker checks off a step, every manager dashboard in the same restaurant re-fetches and updates the live activity feed. No polling.

## Multi-tenant readiness

v1 is single-restaurant, but the schema can host many restaurants without changes:

- Every domain table has a `restaurant_id` column already.
- All RLS policies use `current_restaurant_id()` which reads from `profiles`.
- Adding a second restaurant is just inserting a row in `restaurants` and changing some manager's `profiles.restaurant_id`.

What's *not* ready for multi-tenant:

- There's no Admin UI for creating restaurants. v1 does it via SQL.
- There's no concept of a manager managing multiple restaurants (one user = one profile = one restaurant). This is a deliberate v1 limit. v2 would need either multiple profiles per user or a `restaurant_users` join table.

## File map

```
src/
├── lib/
│   ├── supabase.js     ← client singleton, phoneToEmail helper
│   ├── auth.jsx        ← AuthProvider context, useAuth hook
│   └── api.js          ← createWorker, photo upload, progress helpers
├── pages/
│   ├── Login.jsx
│   ├── ManagerView.jsx ← top-level manager shell + data loading
│   └── WorkerView.jsx  ← top-level worker shell + data loading
├── components/
│   ├── TodayProgress.jsx     ← stats, overall bar, status table, live feed
│   ├── SopsManager.jsx       ← list + editor for SOPs
│   ├── WorkersManager.jsx    ← list + add/remove for workers
│   └── WorkerSopRunner.jsx   ← step-by-step execution with photo upload
├── styles/
│   └── global.css
├── App.jsx             ← role-based view selection
└── main.jsx            ← React + Router + AuthProvider mount
```

The `pages/` files are responsible for *data loading* and overall layout; `components/` files are responsible for *UI and user interactions*. Pages pass data down; components call back up via callbacks like `onChange`.
