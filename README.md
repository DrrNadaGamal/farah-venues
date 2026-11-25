# Farah (فرح)

Operations for an Egyptian wedding and events venue: three halls (indoor ballroom, garden, rooftop) with capacities, per-guest catering menus in tiers, client records, event bookings moving through stages from reserved to completed, a per-event planning checklist, external vendor jobs (photography, DJ, flowers, cake, lighting) that vendors accept and finish themselves, payments against each event's balance, monthly money reports per hall, and an audit log. Bilingual (English / Arabic, RTL), five PIN-based roles for the demo.

**Live demo:** https://farah-venues.vercel.app

Product direction, scope and delivery: Nada Gamal

## The demo venue

One shared demo venue: ten clients, three halls, four menus, twenty events across a year of history and the coming weeks (completed weddings, one held event awaiting completion, upcoming reservations and confirmations, one cancellation that still owes a refund), a hundred checklist items, thirteen vendor jobs and twelve months of payments. The data is deterministic: a fresh instance always starts from the same seed.

## Roles

Sign in with a PIN (public on the sign-in screen, this is a demo):

| PIN | Role | Can do |
| --- | --- | --- |
| 1111 | Venue manager | Everything: halls, menus and prices, event stages, cancellations, checklist, vendors, clients, payments, reports and the audit log |
| 2222 | Event planner | Clients, events, checklist and vendor assignments, confirms events once the deposit lands. No venue pricing, no cancellations, no payments, no audit |
| 3333 | Finance | Payments and reports. No bookings, no venues, no checklist, no audit |
| 4444 | Day coordinator | Sees events, checklist and vendor jobs to run the day. Never sees money |
| 5555 | Vendor partner | Only their own assigned jobs, which they accept and mark done. No events, clients, payments or costs |

## How work flows

An event is booked for a client on a hall and menu for a future date; the guest count must fit the hall, a hall can never hold two active events on the same date, and the per-guest rate is snapshotted from the menu at booking. Five checklist items open with every event and toggle done as the team prepares. An event confirms only once at least 30% is paid; payments never exceed the balance and can never be dated in the future. Once the date passes a confirmed event is marked held, and a held event completes only when the balance is zero and every checklist item is done. Cancelling an event frees the hall's date and flags any refund owed on the dashboard. Vendor jobs only move forward (assigned, accepted, done), and a vendor account touches only its own jobs. The day coordinator never sees a rate, a payment or a balance anywhere, including reports; the vendor sees nothing but their own job list.

## Reports

Twelve rolling months of events, guests, booked value and collections, plus per-hall totals, and the venue's money position: booked this month, collected this month and total outstanding. The manager, planner and finance see money; the coordinator's reports are zeroed; the vendor sees only job counts.

## Honest limits

- No database. State lives in the memory of the running server instance and is rebuilt from the seed about every 6 hours or on restart. Two browser tabs share the same venue by design.
- PINs are demo-grade. They are public on the sign-in screen; tokens are signed with an environment secret, but this is not production auth.
- One venue per deployment. There is no multi-tenancy, no availability calendar grid, no contract or invoice PDFs and no online payments.
- Vendor jobs track stage and cost; deliverables and files are not uploaded or stored.

## Stack

Vanilla JS single-page app (`public/`), one serverless function (`api/data.js`) holding the shared state, business rules in `public/logic.js` shared verbatim by the browser, the server and the tests. No build step. Deployed on Vercel as a static site plus one function.

## Development

```
npm install
npm run dev        # local server on :3500 with the same API handler
npm test           # unit tests for logic and i18n
node e2e/e2e.mjs http://localhost:3500    # full browser + API suite (needs Chrome)
node e2e/shots.mjs http://localhost:3500  # screenshots into docs/
```

The e2e suite (111 checks) covers API security (forged tokens, prototype names as actions, oversized bodies, method handling), every role's permission lane, the full event lifecycle (booking, hall double-booking and capacity guards, the 30% confirm rule, payments, checklist, vendor job stages and ownership, held/completed/cancelled transitions and refund flags), idempotency keys, the coordinator and vendor never seeing money, XSS stored as text, Arabic RTL, 390px layouts and zero page errors. It runs to completion against the live URL before every release.

## Environment

`FARAH_SECRET` — signing secret for session tokens (set in the Vercel project).
