import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Creator partners end to end: a creator applies through the API, staff
 * approve them in the panel, a fan joins with their code and buys, the
 * creator asks for a payout, staff pay it in the panel.
 *
 * Needs the API (dev providers, OTP_FIXED_CODE) at VIBE_API_URL and the
 * owner account (ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD), like admin.spec.ts.
 */
const EMAIL = process.env.ADMIN_E2E_EMAIL ?? "owner@vibe.local";
const PASSWORD = process.env.ADMIN_E2E_PASSWORD ?? "";
const API = `${(process.env.VIBE_API_URL ?? "http://localhost:3000").replace(/\/$/, "")}/v1`;
const OTP = process.env.E2E_OTP_CODE ?? "1234";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

type Auth = { Authorization: string };

async function ok<T>(res: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

/** An app user signed up through the API (dev OTP), with a name and age. */
async function appUser(api: APIRequestContext, name: string, extra: Record<string, unknown> = {}): Promise<{ id: string; auth: Auth }> {
  const email = `pw-${name.toLowerCase().replace(/\W+/g, "")}-${Date.now()}@vibe.test`;
  await ok(await api.post(`${API}/auth/otp/request`, { data: { email } }));
  const r = await ok<{ user: { id: string }; tokens: { accessToken: string } }>(await api.post(`${API}/auth/otp/verify`, { data: { email, code: OTP, ...extra } }));
  const auth = { Authorization: `Bearer ${r.tokens.accessToken}` };
  await ok(await api.patch(`${API}/me`, { headers: auth, data: { name, age: 25, gender: "male", countryCode: "PK", avatarUrl: "https://i.pravatar.cc/400?img=12" } }));
  return { id: r.user.id, auth };
}

test.describe("growth: creator partners", () => {
  test.skip(!PASSWORD, "Set ADMIN_E2E_PASSWORD to run the panel tests");

  test("approve an application, then pay the partner's payout", async ({ page, playwright }) => {
    const api = await playwright.request.newContext();
    const code = `PW${Date.now().toString(36).toUpperCase()}`.slice(0, 20);

    // Staff token for setting the rules: no hold, small minimum payout, instant activation.
    const login = await ok<{ tokens: { accessToken: string } }>(await api.post(`${API}/admin/auth/login`, { data: { email: EMAIL, password: PASSWORD } }));
    const staff = { Authorization: `Bearer ${login.tokens.accessToken}` };
    const economy = await ok<{ economy: Record<string, number> }>(await api.get(`${API}/admin/economy`, { headers: staff }));
    const patch = { affiliateHoldDays: 0, affiliateMinPayoutUsdCents: 100, referralActivationCalls: 0, referralRequireVerified: 0 };
    const base = Object.fromEntries(Object.keys(patch).map((k) => [k, economy.economy[k]]));
    await ok(await api.put(`${API}/admin/economy/rules`, { headers: staff, data: { value: patch, base } }));

    try {
      // A verified creator applies.
      const creator = await appUser(api, "Playwright Creator");
      await ok(await api.post(`${API}/me/verification`, { headers: creator.auth, multipart: { selfie: { name: "selfie.jpg", mimeType: "image/jpeg", buffer: Buffer.from("selfie") } } }));
      await ok(await api.post(`${API}/affiliate/apply`, { headers: creator.auth, data: { displayName: "PW Creator", code, channels: [{ platform: "youtube", url: "https://youtube.com/@pwcreator", followers: 12000 }], note: "Playwright application" } }));

      // Staff approve it in the panel with their own share.
      await signIn(page);
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Affiliates\b/ }).click();
      await expect(page.getByRole("heading", { name: "Affiliates" })).toBeVisible();
      await page.getByPlaceholder("Code, name, e-mail or id").fill(code);
      const row = page.locator("tbody tr[tabindex]").filter({ hasText: code });
      await expect(row).toBeVisible();
      await row.locator("td").last().click();
      await expect(page).toHaveURL(/\/affiliates\/c/);
      await page.getByRole("button", { name: "Approve" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Share of purchases").fill("30");
      await dialog.getByRole("button", { name: "Approve" }).click();
      await expect(page.getByText(`${"PW Creator"} is a partner now`)).toBeVisible();
      await expect(page.getByRole("heading", { name: /PW Creator/ }).getByText("Active")).toBeVisible();
      await expect(page.getByText("30% of purchases").first()).toBeVisible();

      // A fan joins with the code and buys; the creator asks for a payout.
      const fan = await appUser(api, "Playwright Fan", { inviteCode: code, inviteSource: "youtube", inviteVia: "web" });
      await ok(await api.post(`${API}/payments/purchases`, { headers: { ...fan.auth, "Idempotency-Key": `pw-${Date.now()}` }, data: { productType: "COIN_PACK", productId: "value", method: "GOOGLE_PLAY", receipt: `pw-receipt-${Date.now()}` } }));
      const acct = await ok<{ id: string }>(await api.post(`${API}/wallet/payout-accounts`, { headers: creator.auth, data: { method: "JAZZCASH", account: "03001234567", holderName: "Playwright Creator" } }));
      await expect.poll(async () => (await ok<{ balance: { pendingUsdCents: number; availableUsdCents: number } }>(await api.get(`${API}/affiliate`, { headers: creator.auth }))).balance.availableUsdCents).toBeGreaterThanOrEqual(100);
      const payout = await ok<{ id: string; usdCents: number }>(await api.post(`${API}/affiliate/payouts`, { headers: creator.auth, data: { payoutAccountId: acct.id } }));

      // Staff pay it.
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Affiliate payouts/ }).click();
      await expect(page.getByRole("heading", { name: "Affiliate payouts" })).toBeVisible();
      const payoutRow = page.locator("tbody tr").filter({ hasText: code });
      await expect(payoutRow).toBeVisible();
      await payoutRow.getByRole("button", { name: "Mark paid" }).click();
      const pay = page.getByRole("dialog");
      await pay.getByRole("button", { name: "Show full account" }).click();
      await expect(pay.getByText("03001234567")).toBeVisible();
      await pay.getByLabel("Transfer reference").fill("PW-JC-0001");
      await pay.getByRole("button", { name: "Mark paid" }).click();
      await expect(page.getByText("Marked as paid")).toBeVisible();
      await expect(payoutRow).toBeHidden();
      await page.getByRole("tab", { name: "Paid" }).click();
      await expect(page.locator("tbody tr").filter({ hasText: code })).toContainText("PW-JC-0001");

      const after = await ok<{ balance: { paidUsdCents: number }; openPayout: unknown }>(await api.get(`${API}/affiliate`, { headers: creator.auth }));
      expect(after.balance.paidUsdCents).toBe(payout.usdCents);
      expect(after.openPayout).toBeNull();
    } finally {
      // Put the rules back as they were.
      const now = await ok<{ economy: Record<string, number> }>(await api.get(`${API}/admin/economy`, { headers: staff }));
      await api.put(`${API}/admin/economy/rules`, { headers: staff, data: { value: base, base: Object.fromEntries(Object.keys(patch).map((k) => [k, now.economy[k]])) } });
      await api.dispose();
    }
  });
});
