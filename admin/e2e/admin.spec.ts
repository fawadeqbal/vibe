import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.ADMIN_E2E_EMAIL ?? "owner@vibe.local";
const PASSWORD = process.env.ADMIN_E2E_PASSWORD ?? "";

async function signIn(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Opens the first real user (not a dev bot) from the users list. */
async function openFirstUser(page: Page) {
  await page.goto("/users");
  const row = page.locator("tbody tr[tabindex]").first();
  await row.locator("td").last().click();
  await expect(page).toHaveURL(/\/users\/c/);
}

test.describe("admin panel", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!PASSWORD, "Set ADMIN_E2E_PASSWORD to run the panel tests");
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("signed-out visitors go to sign-in and come back", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/finance/purchases");
    await expect(page).toHaveURL(/\/login\?next=%2Ffinance%2Fpurchases/);
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Password").fill("wrong-password-1");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Wrong e-mail or password")).toBeVisible();
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/finance\/purchases$/);
  });

  test("search users, adjust a balance, see it in the ledger", async ({ page }) => {
    await page.goto("/users");
    await page.getByPlaceholder("Name, e-mail, id, invite code").fill("Ayesha");
    await expect(page).toHaveURL(/q=Ayesha/);
    await expect(page.locator("tbody tr[tabindex]").first()).toContainText("Ayesha");
    await page.locator("tbody tr[tabindex]").first().locator("td").last().click();
    await page.getByRole("button", { name: "Adjust balance" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Coins").fill("100");
    await dialog.getByLabel("Internal reason").fill("e2e test credit");
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(/Balance now/)).toBeVisible();
    await page.getByRole("tab", { name: "Wallet" }).click();
    await expect(page.locator("tbody").getByText("Gift from the Vibe team").first()).toBeVisible();
  });

  test("ban and unban with a reason; both are audited", async ({ page }) => {
    await openFirstUser(page);
    await page.getByRole("button", { name: "Ban" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "3 days" }).click();
    await dialog.getByLabel("Reason").fill("e2e: spam in chat");
    await dialog.getByRole("button", { name: "Ban", exact: true }).click();
    await expect(page.getByText(/Banned until/)).toBeVisible();
    await page.getByRole("button", { name: "Unban" }).click();
    await page.getByRole("dialog").getByLabel("Reason").fill("e2e: appeal accepted");
    await page.getByRole("dialog").getByRole("button", { name: "Unban" }).click();
    await expect(page.getByText(/Banned until/)).toBeHidden();
    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByText("user.unbanned").first()).toBeVisible();
    await expect(page.getByText("user.banned").first()).toBeVisible();
  });

  test("moderation: person queue → their reports → a decision", async ({ page }) => {
    await page.goto("/moderation");
    const person = page.locator("tbody tr[tabindex]").first();
    await page.locator("tbody tr[tabindex], :text('Queue is clear')").first().waitFor();
    test.skip((await person.count()) === 0, "No open reports to work on");
    await person.locator("td").nth(1).click();
    await expect(page).toHaveURL(/view=all.*reportedId=/);
    await page.locator("tbody tr[tabindex]").first().locator("td").nth(2).click();
    await expect(page).toHaveURL(/\/moderation\/c/);
    await page.getByRole("radio", { name: "Dismiss" }).click();
    await page.getByRole("button", { name: "Dismiss report" }).click();
    await expect(page.getByText(/Resolved as/)).toBeVisible();
  });

  test("settings: a risky toggle asks first and is reversible", async ({ page }) => {
    await page.goto("/settings");
    const toggle = page.getByRole("switch", { name: "Hold all cash-outs" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, change it" }).click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("announcements: draft then publish", async ({ page }) => {
    const title = `E2E ${Date.now()}`;
    await page.goto("/announcements");
    await page.getByRole("button", { name: "New announcement" }).click();
    await page.getByRole("dialog").getByLabel("Title").fill(title);
    await page.getByRole("dialog").getByLabel("Message").fill("Hello from the end-to-end test.");
    await page.getByRole("dialog").getByRole("button", { name: "Save draft" }).click();
    const card = page.locator("div", { has: page.getByRole("heading", { name: title }) }).last();
    await card.getByRole("button", { name: "Publish" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
    await expect(card.getByText("Live")).toBeVisible();
  });

  test("custom role + invited staff: forced password change, limited menu", async ({ page, browser }) => {
    const stamp = Date.now();
    await page.goto("/team/roles");
    await page.getByRole("button", { name: "New role" }).click();
    const editor = page.getByRole("dialog");
    await editor.getByRole("textbox", { name: "Name" }).fill(`Analyst ${stamp}`);
    await editor.getByText("View dashboard").click();
    await editor.getByText("View users", { exact: true }).click();
    await editor.getByRole("button", { name: "Save role" }).click();
    await expect(page.getByRole("heading", { name: `Analyst ${stamp}` })).toBeVisible();

    await page.goto("/team");
    await page.getByRole("button", { name: "Add person" }).click();
    const invite = page.getByRole("dialog");
    await invite.getByLabel("Name").fill("Ana Lyst");
    await invite.getByLabel("Work e-mail").fill(`ana${stamp}@vibe.test`);
    await invite.getByLabel("Role").selectOption({ label: `Analyst ${stamp}` });
    await invite.getByRole("button", { name: "Add", exact: true }).click();
    const temp = (await invite.locator("code").innerText()).trim();
    expect(temp).toMatch(/^\w{4}-\w{4}-\w{4}-\w{4}$/);

    const other = await browser.newContext();
    const p2 = await other.newPage();
    await signIn(p2, `ana${stamp}@vibe.test`, temp);
    await expect(p2).toHaveURL(/\/setup/);
    await p2.getByLabel("Current password").fill(temp);
    await p2.getByLabel("New password", { exact: true }).fill("Analyst-pass-2026");
    await p2.getByLabel("Repeat new password").fill("Analyst-pass-2026");
    await p2.getByRole("button", { name: "Save password" }).click();
    await expect(p2.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    const nav = p2.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await p2.goto("/settings");
    await expect(p2.getByText("You don't have access to this page")).toBeVisible();
    await other.close();
  });

  test("e-mail templates: edit with live preview, test send, reset", async ({ page }) => {
    await page.goto("/mail-templates");
    await page.getByRole("link", { name: /Sign-in code/ }).click();
    await expect(page).toHaveURL(/\/mail-templates\/sign_in_code$/);
    const subject = page.getByLabel("Subject");
    await subject.fill("Your Vibe code: {{code}} (e2e)");
    const frame = page.frameLocator("iframe[title='E-mail preview']");
    await expect(page.getByText(/Your Vibe code: \d+ \(e2e\)/).first()).toBeVisible();
    await expect(frame.locator("body")).toContainText(/\d{4,}/);
    // The code placeholder can't be removed from the sign-in e-mail.
    await page.getByLabel("Highlight box").fill("");
    await page.getByLabel("Subject").fill("No code here");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "must include {{code}}" })).toBeVisible();
    await page.getByRole("button", { name: "Discard" }).click();
    await subject.fill("Your Vibe code: {{code}} (e2e)");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Template saved")).toBeVisible();
    await page.getByRole("button", { name: "Send me a test" }).click();
    await expect(page.getByText(/Test sent to/)).toBeVisible();
    await page.getByRole("button", { name: "Reset to default" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reset" }).click();
    await expect(subject).toHaveValue("{{code}} is your Vibe code");
  });

  test("messages: pick a person from their profile, preview, send, see delivery", async ({ page }) => {
    await openFirstUser(page);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Send a message" }).click();
    await expect(page).toHaveURL(/\/messages\/new\?to=/);
    await expect(page.getByLabel("Template")).toHaveValue("general_message");
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(1);
    const subject = `E2E hello ${Date.now()}`;
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("Message", { exact: true }).fill("Thanks for being on **Vibe**.");
    await expect(page.getByText(/Ready to reach 1 person/)).toBeVisible();
    await page.getByRole("tab", { name: "In-app" }).click();
    await expect(page.getByText(subject).last()).toBeVisible();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send now" }).click();
    await expect(page).toHaveURL(/\/messages\/c/);
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await page.goto("/messages");
    await expect(page.locator("tbody").getByText(subject)).toBeVisible();
  });

  test("messages: a filtered group shows live counts; everyone needs SEND typed", async ({ page }) => {
    await page.goto("/messages/new");
    await page.getByRole("radio", { name: /Filtered group/ }).click();
    await page.getByLabel("VIP").selectOption({ label: "VIP only" });
    await expect(page.getByText(/\d+ (person|people)/).first()).toBeVisible();
    await page.getByRole("radio", { name: /Everyone/ }).click();
    await page.getByLabel("Subject").fill("E2E everyone");
    await page.getByLabel("Message", { exact: true }).fill("Not actually sent.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Send now" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("economy: read-only until the pencil; edit a rule and a pack list, then back to defaults", async ({ page }) => {
    // Start from the defaults even if an earlier run stopped half-way.
    for (const s of ["rules", "packs"]) await page.request.post(`/api/v1/admin/economy/${s}/reset`, { headers: { "x-vibe-admin": "1" } });
    await page.goto("/economy");
    const rewards = page.getByRole("region", { name: /^Free coins/ });
    await expect(page.getByRole("button", { name: "Edit Free coins" })).toBeVisible();
    await expect(page.getByLabel("Welcome coins")).toHaveCount(0);

    await page.getByRole("button", { name: "Edit Free coins" }).click();
    await page.getByLabel("Welcome coins").fill("4.5");
    await expect(page.getByText("Welcome coins: whole numbers only")).toBeVisible();
    await page.getByLabel("Welcome coins").fill("45");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("30 coins → 45 coins");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByLabel("Welcome coins")).toHaveCount(0);
    await expect(rewards.getByText("45 coins")).toBeVisible();
    await expect(page.getByText("Changed").first()).toBeVisible();

    await page.getByRole("button", { name: "Edit Coin packs" }).click();
    await page.getByRole("button", { name: "Add pack" }).click();
    await page.getByLabel("Pack, pack 6").fill("E2E pack");
    await page.getByLabel("Coins, pack 6").fill("777");
    await page.getByLabel("Price, pack 6").fill("7.77");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "e2e_pack" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "$7.77" })).toBeVisible();

    for (const section of ["Coin packs", "Free coins"]) {
      await page.getByRole("button", { name: `Edit ${section}` }).click();
      await page.getByRole("button", { name: "Use defaults" }).click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("button", { name: `Edit ${section}` })).toBeVisible();
    }
    await expect(page.getByRole("cell", { name: "e2e_pack" })).toHaveCount(0);
    await expect(page.getByText("Changed")).toHaveCount(0);
  });

  test("command palette finds a user", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder(/Search users/).fill("Sofia");
    await page.getByRole("option", { name: /Sofia/ }).first().click();
    await expect(page).toHaveURL(/\/users\/c/);
  });
});
