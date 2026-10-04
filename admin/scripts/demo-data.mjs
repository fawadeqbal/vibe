// Fills a dev database with believable activity through the real APIs
// (dev Google sign-in, dev payment provider; ~90 s because of rate limits). Usage: node scripts/demo-data.mjs
const API = process.env.VIBE_API_URL ?? 'http://localhost:3000';
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? 'owner@vibe.local';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, body, token, extra = {}) {
  const r = await fetch(`${API}/v1/${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  const d = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t}`);
  return d;
}
const people = [
  ['Ayesha Khan', 24, 'female', 'PK', 44], ['Bilal Ahmed', 27, 'male', 'PK', 12], ['Sofia Martins', 23, 'female', 'BR', 20], ['Liam Walker', 26, 'male', 'GB', 15],
  ['Priya Sharma', 25, 'female', 'IN', 47], ['Mert Yilmaz', 28, 'male', 'TR', 33], ['Hana Sato', 22, 'female', 'JP', 9], ['Omar Haddad', 30, 'male', 'AE', 59],
  ['Zara Ali', 21, 'female', 'PK', 5], ['Daniel Kim', 29, 'male', 'KR', 68], ['Lucía Gómez', 24, 'female', 'ES', 26], ['Usman Tariq', 23, 'male', 'PK', 51],
];
const uid = Date.now() % 1_000_000;
const users = [];
for (let i = 0; i < people.length; i++) {
  const [name, age, gender, countryCode, img] = people[i];
  // Dev social sign-in ("dev:<id>:<name>"), throttled to 10/min per IP.
  const s = await call('POST', 'auth/social', { provider: 'google', idToken: `dev:demo-${uid}-${i}:${name}` });
  const t = s.tokens.accessToken;
  await call('PATCH', 'me', { name, age, gender, countryCode, bio: 'Here for good conversations.', interests: ['Music', 'Travel', 'Coffee'], avatarUrl: `https://i.pravatar.cc/400?img=${img}` }, t);
  await call('POST', 'me/onboarding/complete', {}, t).catch(() => {});
  if (i % 3 === 0) await call('POST', 'me/verification', {}, t).catch(() => {});
  await call('POST', 'wallet/check-in', {}, t).catch(() => {});
  users.push({ id: s.user.id, name, t });
  await sleep(6500);
}
const buy = (u, body) => call('POST', 'payments/purchases', body, u.t, { 'idempotency-key': crypto.randomUUID() }).catch((e) => console.log('buy', e.message));
await buy(users[0], { productType: 'COIN_PACK', productId: 'popular', method: 'GOOGLE_PLAY', receipt: `gp-${crypto.randomUUID()}` });
await buy(users[3], { productType: 'COIN_PACK', productId: 'value', method: 'APP_STORE', receipt: `as-${crypto.randomUUID()}` });
await buy(users[5], { productType: 'VIP_PLAN', productId: 'vip_month', method: 'GOOGLE_PLAY', receipt: `gp-${crypto.randomUUID()}` });
await buy(users[7], { productType: 'COIN_PACK', productId: 'whale', method: 'CARD', cardToken: 'tok_visa' });
await buy(users[9], { productType: 'COIN_PACK', productId: 'pro', method: 'BANK' });
await buy(users[1], { productType: 'COIN_PACK', productId: 'starter', method: 'JAZZCASH', phone: '03001234567' });
// Reports: Omar gets three, Usman two, Bilal one.
const report = (from, to, reason, note) => call('POST', 'reports', { userId: users[to].id, reason, note, block: false }, users[from].t).catch((e) => console.log('report', e.message));
await report(0, 11, 'HARASSMENT', 'Kept asking for my number after I said no');
await report(2, 11, 'SPAM', 'Promoting a Telegram channel');
await report(4, 1, 'OTHER', 'Rude, but not sure it breaks rules');
await report(6, 9, 'SCAM', 'Asked me to send coins for a "prize"');
await report(10, 9, 'SCAM', 'Same crypto pitch as yesterday');

let staffToken;
if (STAFF_PASSWORD) {
  const s = await call('POST', 'admin/auth/login', { email: STAFF_EMAIL, password: STAFF_PASSWORD });
  staffToken = s.tokens.accessToken;
  // Gems for two creators, then cash-outs (one large → review).
  for (const [i, gems] of [[4, 30000], [2, 12000]]) {
    await call('POST', `admin/users/${users[i].id}/wallet`, { coins: 0, gems, title: 'Creator gifts (demo)', reason: 'demo data', idempotencyKey: crypto.randomUUID() }, staffToken);
  }
  await call('POST', 'wallet/cashouts', { gems: 25000, method: 'JAZZCASH', account: '03211234567' }, users[4].t, { 'idempotency-key': crypto.randomUUID() });
  await call('POST', 'wallet/cashouts', { gems: 6000, method: 'EASYPAISA', account: '03451234567' }, users[2].t, { 'idempotency-key': crypto.randomUUID() });
  await call('POST', 'admin/announcements', { title: 'New gifts are here', body: 'Send a Rocket to someone who made your day. 🚀' }, staffToken);
  const live = await call('POST', 'admin/announcements', { title: 'Weekend boost', body: 'VIP is 20% off until Sunday.', audience: 'NON_VIP' }, staffToken);
  await call('POST', `admin/announcements/${live.id}/publish`, {}, staffToken);
  await call('POST', `admin/users/${users[7].id}/notes`, { text: 'Big spender — prioritise support tickets.' }, staffToken);
}
console.log(`Created ${users.length} users`);
