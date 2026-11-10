# Blocked countries

Vibe isn't offered in some countries (by default India `IN`, Israel `IL` and Afghanistan `AF`). The list is a setting, not code: **Admin → Settings → Region**. There are three layers, and each one works without the others.

| Layer | Where | What it does |
|---|---|---|
| 1. Edge | Cloudflare | The website and web app redirect to `vibe.fawadiqbal.dev/unavailable/`. The API answers `451` before the request reaches the server. |
| 2. Server | API (`modules/region`) | Every app route checks the visitor's country (Cloudflare's `CF-IPCountry` **and** our own lookup of the address). Blocked → `451 REGION_UNAVAILABLE`, sockets refused, each refusal counted. |
| 3. Signals | API | A profile can't be set to a blocked country, and such a profile can't match. Phone numbers (`+91`, `+972`, `+93`) and IBANs from those countries are refused. Cards: see below. |

The web and the app show a full "Vibe isn't available in your region" screen when they get a `451`. Blocked countries are also left out of every country picker (the catalog sends `blockedCountries`).

Staff routes (the admin panel), provider webhooks, health checks, the legal pages and e-mail unsubscribe links are never blocked.

## 1. Cloudflare (run once, and again after changing the list)

Create an API token: Cloudflare → My Profile → API Tokens → Create Token → Custom token, for the Vibe zone only, with:

- Zone → Zone WAF → Edit
- Zone → Single Redirect → Edit (called "Dynamic URL Redirects" in some places)

The zone ID is on the domain's Overview page. Then, from `backend/`:

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=… npm run region:cloudflare -- --dry-run   # look first
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=… npm run region:cloudflare
```

It reads the list from the live API (`GET /v1/catalog`), or pass `--countries IN,IL,AF`. It adds two rules and finds them again by name next time, so it's safe to run again. Your other rules are left alone. `--off` turns both rules off.

- **Redirect rule** (`vibe_region_redirect`): `vibe.fawadiqbal.dev` and `app.vibe.fawadiqbal.dev` → `/unavailable/`. The unavailable page, privacy, terms and delete-account pages stay open.
- **WAF rule** (`vibe_region_block`): `api.vibe.fawadiqbal.dev` → Block with a JSON `451` body. If your plan doesn't allow a custom block response, the script skips this rule. The API's own check (layer 2) answers the same `451`, so nothing is left open.

The admin panel (`admin.vibe…`) is not blocked, so staff can work from anywhere.

### Keep the origin behind Cloudflare

The server trusts `CF-IPCountry` and `CF-Connecting-IP`. Someone who reaches the server directly, without going through Cloudflare, could fake those headers. Allow ports 80/443 on the server only from [Cloudflare's IP ranges](https://www.cloudflare.com/ips/). The server also looks the address up itself, so a missing header doesn't let anyone through.

## 2. What the server does

- **Setting:** `region.blockEnabled` (on/off) and `region.blockedCountries` (the list). A change applies to every server within seconds.
- **Refusals:** a request from a blocked country gets `451` with `{ "error": { "code": "REGION_UNAVAILABLE" } }`. Admin → Settings → Region shows how many got through Cloudflare in the last 7 days, by country.
- **Field errors** (profile country, phone, IBAN) are `400 COUNTRY_NOT_SUPPORTED` with a message for the form. They don't show the full block screen.

## 3. Payments

- **JazzCash, Easypaisa and payouts** only take Pakistani numbers (`03…`). A `+91`, `+972` or `+93` number gets a clear "can't be used on Vibe" error. IBANs starting with a blocked country's code are refused too.
- **Cards:** the checkout tells the gateway which issuer countries to decline (`blockedCardCountries`). Use the gateway's own country blocking when you add a real gateway. If a card from a blocked country still gets paid, it isn't delivered: the purchase fails with code `CARD_REGION` (see the purchase's events in Admin), and the charge must be refunded in the gateway.
- **Google Play / App Store:** remove those countries under the app's availability: Play Console → Production → Countries / regions, and App Store Connect → Pricing and Availability. The stores then don't offer the app or its purchases there.

## Notes

- GeoIP isn't perfect: VPNs get through, and a few addresses are placed in the wrong country. The profile, phone and card checks catch some of what IP checks miss.
- Telling people why, and keeping their data, is up to your terms and privacy policy. Get legal advice for the countries you block.
