# SOP-Fast

> **Standard operating procedures for restaurants that actually run.**
> Replace the dog-eared clipboard above the prep station with something workers actually use.
> 
> <img width="1280" height="720" alt="Untitled design" src="https://github.com/user-attachments/assets/f3d4cc68-51dd-4e35-914e-0a7cb5e29e17" />


[![Built with Supabase](https://img.shields.io/badge/Built_with-Supabase-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## Why this exists

Every restaurant has a list of things that need to happen — open the bar, prep the line, deep-clean the fryer on Wednesdays, log the walk-in temp every two hours. In most kitchens those routines live in three places: a manager's head, a stained printout, or nowhere at all.

The cost of that is real. Health-code violations, food waste, mornings where the new server doesn't know the closing routine, line cooks repeating the same opening prep three times because nobody can remember who did what.

**SOP-Fast** is a small, opinionated tool that makes the same lists *executable*. A manager builds checklists, assigns them to workers, and watches them get ticked off in real time — with photo proof for the steps that matter (cleaned fryer, walk-in temp reading, mise en place).

It is not a 50-feature operations platform. It is one thing done well: the daily list, executed and audited.

## Who it's for

- **Single-location restaurant owners** who want their team to actually follow the routines they wrote down.
- **General managers** who keep ending up texting workers "did you remember to…?" at 11pm.
- **Founders** building restaurant tooling who want a clean reference architecture for SOP-style apps.

## What's in the box

| Role        | What they do                                                            |
| ----------- | ----------------------------------------------------------------------- |
| **Manager** | Creates SOPs, adds workers, watches a live progress dashboard.          |
| **Worker**  | Logs in on their phone, sees today's tasks, ticks off steps, uploads photo proof when required. |

Plus a small set of features that make this useful in a real kitchen:

- **Recurring vs one-time SOPs.** Daily kitchen open vs "deep clean storage room this Wednesday."
- **Photo-proof steps.** Workers must upload a photo for marked steps before they can check off — perfect for temperature logs, cleanliness audits, mise en place.
- **Live activity feed.** When a worker checks off a step, the manager's dashboard updates in real time. No refresh button.
- **Phone-number login.** No emails, no password reset emails, no SMS provider needed for v1. Workers log in with the phone number their manager set them up with.
- **Row-level security from the database up.** A worker physically cannot read another restaurant's data, no matter what the front-end does.

## Live demo

Coming soon. Until then, follow the [Quick start](#quick-start) below to spin up your own copy in about 15 minutes.

## Architecture at a glance

```
┌─────────────────┐         ┌──────────────────────────┐
│  Worker phone   │         │   Manager laptop/tablet  │
│   (mobile)      │         │      (desktop)           │
└────────┬────────┘         └────────────┬─────────────┘
         │                                │
         │  HTTPS                         │  HTTPS + WebSocket
         │                                │
         └──────────────┬─────────────────┘
                        │
                ┌───────▼────────┐
                │  Vite + React  │   ← deployed on Vercel
                │   SPA bundle   │
                └───────┬────────┘
                        │
                ┌───────▼────────────────────────────┐
                │             Supabase               │
                │  ┌─────────┐ ┌──────┐ ┌─────────┐  │
                │  │ Auth    │ │ DB   │ │ Storage │  │
                │  │ (email) │ │ (PG) │ │ (photos)│  │
                │  └─────────┘ └──────┘ └─────────┘  │
                │           Realtime channels         │
                └────────────────────────────────────┘
```

Five tables, RLS on every one, photo storage with per-worker scoping, real-time subscriptions for the live feed. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full schema and the design decisions behind it.

## Quick start

You need:

- A [Supabase](https://supabase.com) account (free tier is fine for one restaurant)
- A [Vercel](https://vercel.com) account (free tier is fine)
- Node.js 18+ and npm
- About 15 minutes

### 1. Clone and install

```bash
git clone https://github.com/yourusername/sop-fast.git
cd sop-fast
npm install
```

### 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project. Pick a region close to your restaurant.
2. Once the project is ready, go to **SQL Editor** → **New query**.
3. Open `supabase/migrations/20260101000000_init.sql` from this repo, paste the entire contents into the SQL editor, and click **Run**. This creates all tables, RLS policies, the storage bucket, and helper functions.
4. Go to **Authentication** → **Providers** → **Email**. Make sure **Email** is enabled. Turn **Confirm email** OFF (we use phone-as-email, see [ARCHITECTURE.md](./ARCHITECTURE.md#why-fake-email-auth) for why).

### 3. Create your manager account

1. In Supabase, go to **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email: use the format `<phone>@sopfast.app` — for example `9000000001@sopfast.app`.
3. Password: pick something secure. Give it to the manager.
4. Check **Auto confirm user**.
5. Click **Create user**, then copy the new user's UUID from the dashboard.
6. Open `supabase/seed.sql`, replace `MANAGER_USER_UUID` with the UUID, and update the restaurant name and manager name. Run it in the SQL editor.

### 4. Connect your local app to Supabase

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the two values from your Supabase project's **Settings** → **API** page:

- `VITE_SUPABASE_URL` — the Project URL
- `VITE_SUPABASE_ANON_KEY` — the `anon` `public` key

### 5. Run it

```bash
npm run dev
```

Open `http://localhost:5173` and log in with the manager phone number and password from step 3. Add a worker, create your first SOP, then log out and log back in as the worker to see it in action.

## Deployment

### Deploy to Vercel (recommended)

The app is a static SPA, so it deploys in about 30 seconds.

1. Push your repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo.
3. Framework preset: **Vite** (Vercel will detect this automatically).
4. Add the two environment variables under **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**. You'll get a URL like `sop-fast-xyz.vercel.app`.

### Custom domain

Once you have a working Vercel deployment:

1. Buy a domain. Namecheap, Cloudflare Registrar, and Porkbun are all fine. `.app` and `.com` work great. Aim for something short — workers will type it on phones.
2. In Vercel: go to your project → **Settings** → **Domains** → **Add**.
3. Enter your domain (e.g. `app.yourrestaurant.com`).
4. Vercel will tell you which DNS records to add at your registrar:
   - For an apex domain (e.g. `sopfast.app`): an `A` record pointing to `76.76.21.21`.
   - For a subdomain (e.g. `app.sopfast.app`): a `CNAME` pointing to `cname.vercel-dns.com`.
5. Add the records at your registrar. Wait 5–30 minutes for DNS propagation.
6. Vercel auto-provisions a free SSL certificate (Let's Encrypt). HTTPS just works.

**Important:** after adding your custom domain, also go to your **Supabase Project Settings** → **Authentication** → **URL Configuration** and add your domain (e.g. `https://app.yourrestaurant.com`) to **Site URL** and **Redirect URLs**. Without this, sign-in will fail in production.

### Recommended subdomain layout

If you ever build a marketing site, use this split:

- `yourrestaurant.com` — marketing site (later)
- `app.yourrestaurant.com` — this app

This keeps the app fast and the marketing site SEO-friendly without one constraining the other.

## Day-to-day operation

- **A worker forgot their password.** The manager creates a new password for them in Supabase **Authentication** → **Users**, finds their `<phone>@sopfast.app` row, and sends them the new one. (A self-serve password reset is on the [roadmap](./ROADMAP.md).)
- **You hired a new line cook.** Manager logs in, goes to **Workers** → **New worker**, types their name, phone, and a starter password. Worker can log in immediately.
- **You let someone go.** Manager removes them from the **Workers** tab. Their account is no longer linked to the restaurant — they can't see anything. (The Supabase auth user still exists; that's a known v1 limitation, see [ROADMAP.md](./ROADMAP.md).)
- **You want to add a second restaurant.** v1 is single-restaurant. Multi-restaurant is on the roadmap and the schema is already designed for it — see [ARCHITECTURE.md](./ARCHITECTURE.md#multi-tenant-readiness).

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for what's next: scheduled SOPs (lunch vs dinner), per-shift assignment, multi-restaurant admin, exportable audit logs, password self-reset, and more.

## Contributing

This is currently a solo project, but issues and pull requests are welcome. If you're using SOP-Fast in a real restaurant and run into a sharp edge, please open an issue — the most useful improvements come from real kitchens.

## License

MIT. Use it, fork it, ship it.
