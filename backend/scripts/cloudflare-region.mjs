#!/usr/bin/env node
// Blocks Vibe's blocked countries at Cloudflare, before traffic reaches the server.
//
//   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=… npm run region:cloudflare
//   npm run region:cloudflare -- --dry-run            # print the rules, change nothing
//   npm run region:cloudflare -- --countries IN,IL,AF # instead of the list in Admin
//   npm run region:cloudflare -- --off                # turn both rules off
//
// The country list comes from Admin → Settings → Region (read from the API's
// public GET /v1/catalog), so run this again after changing it there. Two
// rules are written, each found again by its `ref`, so running it twice is
// safe and your other rules are never touched:
//
//   1. Redirect rule on the website and web app → the landing page's
//      /unavailable/ ("Vibe isn't available in your region").
//   2. WAF custom rule on the API → Block with a JSON 451 body
//      (REGION_UNAVAILABLE, what the apps understand). If the plan doesn't
//      allow a custom block response, this rule is skipped: the API's own
//      check answers the same 451.
//
// The token needs: Zone → Zone WAF → Edit, and Zone → Single Redirect → Edit
// (shown as "Dynamic URL Redirects" in some places), for the Vibe zone only.
// See infra/REGION.md. No dependencies; Node 18+.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CF = 'https://api.cloudflare.com/client/v4';
const REDIRECT_REF = 'vibe_region_redirect';
const BLOCK_REF = 'vibe_region_block';

// ── settings ────────────────────────────────────────────────────────────────

function loadDotEnv() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const host = (url, fallback) => {
  try {
    return new URL(url).host;
  } catch {
    return fallback;
  }
};

const env = process.env;
const apiUrl = (env.PUBLIC_URL || 'https://api.vibe.fawadiqbal.dev').replace(/\/$/, '');
const siteUrl = (env.SITE_URL || 'https://vibe.fawadiqbal.dev').replace(/\/$/, '');
const hosts = {
  site: option('site-host') ?? host(siteUrl, 'vibe.fawadiqbal.dev'),
  web: option('web-host') ?? host(env.WEB_APP_URL, 'app.vibe.fawadiqbal.dev'),
  api: option('api-host') ?? host(apiUrl, 'api.vibe.fawadiqbal.dev'),
};
const dryRun = flag('dry-run');
const off = flag('off');

// Pages people in a blocked country may still open on the landing site.
const OPEN_PATHS = ['/unavailable', '/unavailable/', '/privacy/', '/terms/', '/delete-account/', '/favicon.ico', '/icon.svg', '/robots.txt'];

async function countries() {
  const given = option('countries');
  if (given) return given.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  const res = await fetch(`${apiUrl}/v1/catalog`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Couldn't read the list from ${apiUrl}/v1/catalog (${res.status}). Pass --countries IN,IL,AF instead.`);
  const body = await res.json();
  if (!Array.isArray(body.blockedCountries)) throw new Error('The API has no blockedCountries yet (deploy the API first, or pass --countries).');
  return body.blockedCountries;
}

// ── rules ───────────────────────────────────────────────────────────────────

const set = (xs) => `{${xs.map((x) => JSON.stringify(x)).join(' ')}}`;

function rules(list) {
  const from = `(ip.src.country in ${set(list)})`;
  const enabled = !off && list.length > 0;
  // An empty `in {}` is invalid, so a switched-off rule keeps a harmless placeholder.
  const where = list.length ? from : '(ip.src.country eq "T1")';
  return {
    redirect: {
      ref: REDIRECT_REF,
      description: 'Vibe: blocked countries → "not available in your region" (npm run region:cloudflare)',
      enabled,
      expression: `${where} and (http.host in ${set([hosts.site, hosts.web])}) and not (http.request.uri.path in ${set(OPEN_PATHS)}) and not (http.request.uri.path contains "/_next/")`,
      action: 'redirect',
      action_parameters: { from_value: { status_code: 302, target_url: { value: `${siteUrl}/unavailable/` }, preserve_query_string: false } },
    },
    block: {
      ref: BLOCK_REF,
      description: 'Vibe: blocked countries can\'t use the API (npm run region:cloudflare)',
      enabled,
      // Provider webhooks and health checks come from servers, wherever those are.
      expression: `${where} and (http.host eq ${JSON.stringify(hosts.api)}) and not (http.request.uri.path contains "/webhooks/") and not (http.request.uri.path contains "/health/")`,
      action: 'block',
      action_parameters: {
        response: {
          status_code: 451,
          content_type: 'application/json',
          content: JSON.stringify({ error: { code: 'REGION_UNAVAILABLE', message: "Vibe isn't available in your region." } }),
        },
      },
    },
  };
}

// ── Cloudflare API ──────────────────────────────────────────────────────────

async function cf(method, url, body) {
  const res = await fetch(`${CF}${url}`, {
    method,
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = (json.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return json.result;
}

/** Adds or updates one rule (by ref) in a zone phase, leaving every other rule alone. */
async function upsert(zone, phase, rule, first = false) {
  let ruleset;
  try {
    ruleset = await cf('GET', `/zones/${zone}/rulesets/phases/${phase}/entrypoint`);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  if (!ruleset) {
    await cf('PUT', `/zones/${zone}/rulesets/phases/${phase}/entrypoint`, { rules: [rule] });
    return 'created';
  }
  const existing = (ruleset.rules ?? []).find((r) => r.ref === rule.ref);
  if (existing) {
    await cf('PATCH', `/zones/${zone}/rulesets/${ruleset.id}/rules/${existing.id}`, rule);
    return 'updated';
  }
  await cf('POST', `/zones/${zone}/rulesets/${ruleset.id}/rules`, first ? { ...rule, position: { index: 1 } } : rule);
  return 'added';
}

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  const list = off ? [] : await countries();
  const r = rules(list);
  console.log(off || !list.length ? 'Turning the region rules off.' : `Blocking: ${list.join(', ')}`);
  console.log(`Website/web app: ${hosts.site}, ${hosts.web} → ${siteUrl}/unavailable/   API: ${hosts.api} → 451`);
  if (dryRun) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  const zone = env.CLOUDFLARE_ZONE_ID;
  if (!env.CLOUDFLARE_API_TOKEN || !zone) throw new Error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID (Cloudflare → your domain → Overview → API).');

  console.log(`✓ Redirect rule ${await upsert(zone, 'http_request_dynamic_redirect', r.redirect)}`);
  try {
    console.log(`✓ API block rule ${await upsert(zone, 'http_request_firewall_custom', r.block, true)} (451 JSON)`);
  } catch (e) {
    // Custom block responses may need a paid plan. Cloudflare's own block page (403 HTML) would show the
    // apps a generic error, so leave the API to its own check, which answers the same 451 REGION_UNAVAILABLE.
    if (!/response|custom|plan|entitle/i.test(e.message)) throw e;
    console.log(`– API block rule skipped: ${e.message}. The API refuses these countries itself (451), so nothing is open.`);
  }
  console.log('Done. Check it: Cloudflare → Security → Events, or Admin → Settings → Region for what still reaches the API.');
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
