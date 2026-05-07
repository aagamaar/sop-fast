# Roadmap

What's next, in rough priority order. This is a working document — open an issue if you want something prioritized differently.

## Soon (v1.1)

These are sharp edges that bite you the moment a real restaurant uses this.

- ~~**Edge Function for worker creation.**~~ ✅ **Shipped.** See `supabase/functions/create-worker/`. Atomically creates auth user + profile, validates caller is a manager, rolls back on failure.
- **Self-serve password reset.** Right now, a forgotten password means the manager opens the Supabase dashboard. Once the Edge Function above is in place, add a "I forgot my password" flow where the manager generates a temporary password from the Workers tab.
- **History pagination.** The worker's History tab currently loads all completions ever. After 30+ days of usage on a busy phone, this gets sluggish. Limit to 30 days by default with a "load more" button.
- **Soft delete for workers.** Removing a worker currently deletes the `profiles` row but leaves the `auth.users` row orphaned. Switch to a soft delete (`profiles.archived = true`) so we can rejoin them later if they come back, and so old completions still show their name in history.

## Next (v1.2)

Features real customers will ask for in their first week.

- **Shift-based assignment.** Right now an SOP is "assigned to Anu" or "assigned to all servers." In a real restaurant, it's "morning shift" or "Wednesdays only." Add a schedule layer: per-day-of-week, per-shift (morning / evening), or specific dates.
- **SOP categories.** Group SOPs into "Opening", "Service", "Closing", "Weekly Deep Clean." Workers see them grouped; managers filter the dashboard by category.
- **Notifications.** Push or SMS to a worker when a new SOP is assigned, or to a manager when a critical SOP (e.g. "log walk-in temp") is overdue. Push first (free, in-browser), SMS later.
- **Exportable audit logs.** Restaurants get inspected. A manager should be able to download "all photo-proof completions for the last 30 days" as a zip with a CSV manifest. This is the single biggest "would pay for it" feature for compliance-conscious owners.

## Later (v2)

The product expands beyond a single restaurant.

- **Multi-restaurant admin.** Bring back the Admin role for restaurant-group operators (3–20 locations). Cross-restaurant dashboards. The schema supports this; only the UI is missing.
- **Real phone OTP auth.** Once SMS volume justifies it, plug in Twilio Verify. The fake-email layer goes away; existing users migrate by re-verifying their number once.
- **Manager mobile view.** The manager dashboard is desktop-first. A pared-down mobile version for owners who walk the floor with a phone.
- **SOP templates.** A library of pre-built SOPs ("Bar opening", "Espresso machine setup") that a new restaurant can clone in one click.
- **Web-based learning.** When a worker is new, the SOP doubles as their training. Add an optional "explanation" field per step with text or video.
- **Analytics.** Per-worker completion rate, fastest/slowest SOPs, frequently-skipped steps. Useful for managers, fascinating for owners.

## Maybe (v3+, depends on traction)

- **Inventory integration.** "When you check off 'restock napkins', auto-decrement the napkin count." Pull from a POS or inventory system.
- **Compliance packs.** Pre-built SOP sets that map to local food-safety codes (FSSAI in India, FDA Food Code in the US, etc.).
- **Public API.** For restaurant groups that want to build custom dashboards or integrate with their existing ops tooling.
- **Native mobile app.** A web app on a home-screen icon is enough for v1 and v2. Native is a project of its own.

## Anti-roadmap

Things that have been suggested but I'm deliberately *not* building:

- **Chat / messaging between workers.** Restaurants already use WhatsApp. Don't compete with it.
- **Shift scheduling.** That's a different product (When I Work, 7shifts, Sling). Do one thing well.
- **Tip pooling, payroll, time tracking.** Same — different products.
- **AI step suggestions.** Cute demo, not a real need. Most restaurants want to write their own SOPs.

The discipline of *not* building things is what keeps a small tool useful. If SOP-Fast becomes a 50-feature platform, it stops being SOP-Fast.
