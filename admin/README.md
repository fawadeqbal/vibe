# Vibe Admin

The back office for Vibe: people, safety, money and operations. A Next.js 16 app that talks to the Vibe API (`../backend`) through its own server, so staff tokens never reach the browser.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Radix UI primitives · TanStack Query · Recharts · Playwright + Vitest.

## Run it

```bash
# 1. The API (see ../backend/README.md) on :3000, with a first owner:
cd ../backend && npm run db:seed        # uses ADMIN_EMAIL / ADMIN_PASSWORD from .env

# 2. The panel on :3001
cd ../admin
cp .env.example .env.local              # VIBE_API_URL=http://localhost:3000
npm install
npm run dev                             # http://localhost:3001
```

Sign in with the owner's e-mail and password. You'll choose a new password first, and set up 2FA if **Settings → Require 2FA for staff** is on. Then invite the team from **Team → Staff**.

Want something to look at? `STAFF_PASSWORD=… npm run demo-data` adds a dozen users, purchases, reports, cash-outs and announcements through the real API (dev providers only).

## What's in it

| Area | Screens |
|---|---|
| Overview | Dashboard (KPIs, revenue and growth charts, work queues), Live (online, searching, live calls, end a call) |
| People | Users (search by name / e-mail / id / invite code, filters), user profile (ban, verify, edit, adjust balance, VIP, sign out, delete, notes, history), Reports (queue by person, all reports, bulk dismiss/ban, report detail with chat transcript and a decision panel), Verifications (selfie next to the profile photo, approve / reject with a reason) |
| Money | Revenue mix, Purchases (confirm bank transfers, refund, provider trail), Cash-outs (approve, mark paid, reject, provider trail), Payout batches (collect waiting bank cash-outs, download the bank CSV, mark paid with the bank's reference, cancel), VIP subscriptions, Ledger |
| Messaging | Messages (write once, send by e-mail and/or in-app to picked people, a filtered group with live counts, or everyone; live e-mail and in-app previews; progress, per-person delivery and stop), E-mail templates (edit the wording with a live preview at desktop/phone width, placeholders, send yourself a test, reset; add your own message templates) |
| Operations | Integrations (live / test mode / off per provider, missing .env keys to copy, URLs to give each provider, 24h webhook counts), Webhooks (provider callback log, payload and headers, retry), Announcements (draft → publish → archive), Settings (maintenance, sign-ups, matching, payout review, staff 2FA), Economy (coin packs, VIP plans, gifts and rules — read-only for everyone, each section has a pencil for people with "Edit prices and rules": inline editing, add/remove/reorder, changes summary before saving, "use defaults", conflict detection) |
| Team | Staff (invite, role, disable, reset password/2FA, sign out), Roles (custom roles with a permission editor), Audit log |
| You | Your account: profile, password, 2FA with recovery codes, active sessions |

Every list pages with a cursor ("Load more"), keeps its filters in the URL (shareable, survives reload), and has loading, empty and error states. Light and dark themes follow the system or the toggle in the top bar. **⌘K / Ctrl+K** finds any user or screen.

## How it's built

```
src/
  app/
    (auth)/login, setup        sign-in and the forced first-time security steps
    (panel)/…                  one folder per screen; each page.tsx is a thin wrapper
    api/auth/*                 BFF sign-in/out: sets httpOnly cookies
    api/v1/[...path]           BFF proxy to the Vibe API's /v1/admin/*
  proxy.ts                     no session cookie → /login (optimistic only)
  components/
    ui/                        primitives: button, input, field, badge, card, dialog/sheet, menu, tabs, switch…
    data-table/                DataTable (columns as data, selection, paging) + filter chips
    common/                    PageHeader, StatCard, StatusBadge, UserCell, Time, Coins/Gems, confirm dialog…
    charts/                    TimeSeriesChart, ShareBars
    layout/                    AppShell (sidebar, top bar), command palette
  features/<area>/             api.ts (query keys + hooks) and the area's screens/dialogs
  hooks/                       useUrlState, useCursorQuery, useAction
  lib/                         api client + types, permissions, nav config, formatting
```

**Conventions that keep it manageable**

- **Feature folders.** Everything for an area (data hooks, columns, dialogs, screens) lives in `features/<area>`. Shared column sets (e.g. purchases) are reused wherever that data appears.
- **The menu is data.** `lib/nav.ts` lists every screen with its icon, permission and badge. The sidebar, the command palette and permission filtering all read it.
- **One way to do each thing.** Lists use `DataTable` + `useCursorQuery` + `useUrlState`. Writes use `useAction` (toast + cache refresh) or `useConfirm()` for "are you sure" with an optional reason and typed confirmation. Statuses render through one `StatusBadge` map.
- **Design tokens, not colours.** `app/globals.css` defines semantic tokens (surface, text, muted, primary, trust = teal, money = gold, bad = red) for light and dark. Components only use those names. Chart colours were validated for colour-blind separation in both themes.
- **Permissions mirror the API.** `lib/permissions.ts` copies the server's keys (a unit test fails if they drift). The UI hides what you can't use; the API enforces it on every call.

### Adding a screen

1. Add the endpoint in the API (`src/modules/admin/<area>`), with `@RequirePermissions(...)` and `@Audit(...)` for writes.
2. Add response types in `src/lib/api/types.ts` and hooks in `src/features/<area>/api.ts`.
3. Build the screen in `src/features/<area>/` from `PageHeader`, `DataTable`, `FilterBar` and friends.
4. Add `src/app/(panel)/<route>/page.tsx` wrapping it in `<RequirePermission>`, and one entry in `lib/nav.ts`.

## Security model

- **Separate staff accounts** (not app users): e-mail + password (scrypt), optional or required TOTP 2FA with one-time recovery codes, lockout after repeated failures, forced password change for invited people.
- **BFF sessions.** The browser holds only two `httpOnly`, `SameSite=Strict` cookies. The panel's server swaps them for API calls and refreshes the 10-minute access token. Refresh tokens rotate; a reused one ends that sign-in. Sessions end after 12 hours regardless.
- **CSRF.** BFF routes require same-origin requests with a custom header the app's own client sends.
- **Least privilege.** Built-in roles (Owner, Admin, Moderator, Finance, Support, Viewer) plus custom roles. People can only grant access they have; only owners manage owners; there is always an active owner. E-mail addresses are masked without the contact-details permission.
- **Everything is audited.** Every write, sign-in, failed attempt and security change is in the audit log with who, what, target, IP and request id.

## Tests

```bash
npm run lint && npm run typecheck
npm test                                  # unit: helpers, navigation, permission keys match the API
ADMIN_E2E_EMAIL=… ADMIN_E2E_PASSWORD=… npm run test:e2e     # Playwright against a running API + panel (an owner account)
```

The end-to-end suite signs in, edits the sign-in e-mail with its live preview (and is stopped from removing the code), sends a test and resets it, sends a message to a person from their profile and watches it deliver, checks filtered-group counts and that "everyone" needs SEND typed, edits a rule and the coin packs on the Economy page and puts the defaults back, searches users, adjusts a balance and checks the ledger, bans and unbans (and checks the audit trail), resolves a report from the person queue, flips a risky setting, publishes an announcement, creates a custom role and invites someone who then has to change their password and only sees what the role allows, and uses the command palette.

`npm run screenshots` saves a light and dark screenshot of every screen.

## Deploy

`docker build -t vibe-admin .` produces a standalone Node server on port 3001. Set `VIBE_API_URL` to the API's internal address. Serve it over HTTPS (cookies are `Secure` in production) on a private hostname, ideally behind a VPN or SSO proxy. It's stateless, so run as many copies as you like. `docker compose --profile api up` in `../backend` starts the API, the panel and their databases together.
