// Screenshot tour of every screen (light + dark). Usage: node scripts/tour.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.ADMIN_URL ?? 'http://localhost:3001';
const OUT = process.env.OUT ?? '/root/shots/admin';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => m.type() === 'error' && !m.text().includes('caret-color') && errors.push(`${p.url()} :: ${m.text().slice(0, 200)}`));
p.on('pageerror', (e) => errors.push(`${p.url()} :: ${e.message}`));
await p.goto(`${BASE}/login`);
await p.fill('input[type=email]', process.env.STAFF_EMAIL ?? 'owner@vibe.local');
await p.fill('input[type=password]', process.env.STAFF_PASSWORD);
await p.click('button[type=submit]');
await p.waitForURL(`${BASE}/`);
const pages = ['/', '/live', '/users', '/moderation', '/moderation?view=all', '/finance', '/finance/purchases', '/finance/cashouts', '/finance/subscriptions', '/finance/ledger', '/messages', '/messages/new', '/mail-templates', '/mail-templates/sign_in_code', '/announcements', '/settings', '/economy', '/team', '/team/roles', '/audit', '/account'];
const firstUser = async () => { await p.goto(`${BASE}/users`); await p.waitForSelector('tbody tr[tabindex]'); await p.locator('tbody tr[tabindex]').first().locator('td').last().click(); await p.waitForURL(/\/users\/c/, { waitUntil: 'commit' }); return p.url().replace(BASE, ''); };
const firstReport = async () => { await p.goto(`${BASE}/moderation?view=all`); await p.waitForSelector('tbody tr[tabindex]'); await p.locator('tbody tr[tabindex]').first().locator('td').nth(2).click(); await p.waitForURL(/\/moderation\/c/, { waitUntil: 'commit' }); return p.url().replace(BASE, ''); };
pages.push(await firstUser(), await firstReport());
for (const theme of ['light', 'dark']) {
  await p.evaluate((t) => localStorage.setItem('vibe-admin-theme', t), theme);
  for (const path of pages) {
    await p.goto(`${BASE}${path}`);
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(900);
    const name = (path === '/' ? 'dashboard' : path.slice(1).replace(/[/?=]/g, '_')).slice(0, 60);
    await p.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: theme === 'light' });
  }
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await b.close();
