import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/errors";
import { type CheckoutBackend, CheckoutController } from "../checkout-controller";
import type { PaymentMethodOption, PurchaseView } from "../payments";

const jazz: PaymentMethodOption = { method: "jazzCash", flow: "wallet", label: "JazzCash", live: false, currency: "PKR", needs: ["phone", "cnicLast6"] };
const card: PaymentMethodOption = { method: "card", flow: "redirect", label: "Card", live: false, currency: "PKR", needs: [] };

const view = (over: Partial<PurchaseView>): PurchaseView => ({
  id: "p1",
  state: "requiresAction",
  productType: "coinPack",
  productId: "starter",
  method: "jazzCash",
  usd: 0.99,
  currency: "PKR",
  amount: 277,
  receipt: null,
  action: null,
  expiresAt: null,
  failureReason: null,
  completedAt: null,
  wallet: null,
  ...over,
});

function fakeBackend(over: Partial<CheckoutBackend> = {}) {
  const listeners = new Set<(p: PurchaseView) => void>();
  const backend: CheckoutBackend = {
    paymentOptions: async () => ({ methods: [jazz, card], usdToPkr: 280 }),
    createPurchase: vi.fn(async () => view({ action: { type: "otp", url: null, post: false, fields: {}, instructions: "any 4 digits", bank: null } })),
    purchase: async () => view({}),
    confirmPurchase: async () => view({ state: "succeeded" }),
    checkPurchase: async () => view({}),
    cancelPurchase: async () => view({ state: "failed", failureReason: "Cancelled" }),
    sendBankReference: async () => view({}),
    onPurchaseUpdate: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    ...over,
  };
  return { backend, push: (p: PurchaseView) => listeners.forEach((l) => l(p)) };
}

afterEach(() => vi.useRealTimers());

describe("CheckoutController", () => {
  it("works again after dispose → activate (a React Strict Mode remount)", async () => {
    const { backend, push } = fakeBackend({ createPurchase: async () => view({ method: "card", action: { type: "redirect", url: "https://pay", post: false, fields: {}, instructions: null, bank: null } }) });
    const c = new CheckoutController(backend, "coinPack", "starter", 0.99);
    const seen = vi.fn();
    c.subscribe(seen);
    void c.load(); // first mount starts loading…
    c.dispose(); // …and is torn down at once
    c.activate(); // second mount
    await c.load();
    expect(c.snapshot().stage).toBe("methods");
    expect(seen).toHaveBeenCalled();
    await c.choose(card);
    push(view({ state: "succeeded" }));
    expect(c.snapshot().stage).toBe("succeeded"); // pushes are heard again
    c.dispose();
    push(view({ state: "failed" }));
    expect(c.snapshot().stage).toBe("succeeded"); // and ignored once disposed
  });

  it("walks a wallet payment: methods → details → otp → succeeded", async () => {
    const { backend } = fakeBackend();
    const c = new CheckoutController(backend, "coinPack", "starter", 0.99, { newKey: () => "k1" });
    await c.load();
    expect(c.snapshot().stage).toBe("methods");
    await c.choose(jazz);
    expect(c.snapshot().stage).toBe("details");
    expect(c.price).toEqual({ currency: "PKR", amount: 277 });
    await c.submitDetails("0300 123", "123456");
    expect(c.snapshot().error).toMatch(/03001234567/);
    await c.submitDetails("03001234567", "12");
    expect(c.snapshot().error).toMatch(/CNIC/);
    await c.submitDetails("03001234567", "123456");
    expect(backend.createPurchase).toHaveBeenCalledWith(expect.objectContaining({ phone: "03001234567", cnicLast6: "123456" }), "k1");
    expect(c.snapshot().stage).toBe("otp");
    await c.confirmOtp("1234");
    expect(c.snapshot().stage).toBe("succeeded");
    c.dispose();
  });

  it("keeps a closed purchase closed when a stale push arrives", async () => {
    const { backend, push } = fakeBackend({ createPurchase: async () => view({ method: "card", action: { type: "redirect", url: "https://pay", post: false, fields: {}, instructions: null, bank: null } }) });
    const c = new CheckoutController(backend, "coinPack", "starter", 0.99);
    await c.load();
    await c.choose(card);
    expect(c.snapshot().stage).toBe("redirect");
    push(view({ state: "succeeded" }));
    expect(c.snapshot().stage).toBe("succeeded");
    push(view({ state: "requiresAction" }));
    expect(c.snapshot().stage).toBe("succeeded");
    c.dispose();
  });

  it("fails cleanly on a declined charge and retries with a new key", async () => {
    let n = 0;
    const create = vi.fn(async () => {
      if (n++ === 0) throw new ApiError("PAYMENT_DECLINED", "Declined", 402);
      return view({ state: "succeeded" });
    });
    const keys = ["a", "b"];
    const { backend } = fakeBackend({ createPurchase: create });
    const c = new CheckoutController(backend, "coinPack", "starter", 0.99, { newKey: () => keys.shift()! });
    await c.load();
    await c.choose(card);
    expect(c.snapshot().stage).toBe("failed");
    expect(c.snapshot().error).toBe("Declined");
    await c.retry();
    expect(c.snapshot().stage).toBe("succeeded");
    expect(create.mock.calls.map((x) => (x as unknown[])[1])).toEqual(["a", "b"]);
    c.dispose();
  });

  it("polls while waiting on the provider", async () => {
    vi.useFakeTimers();
    const purchase = vi.fn(async () => view({ action: { type: "approveInApp", url: null, post: false, fields: {}, instructions: null, bank: null } }));
    const { backend } = fakeBackend({ createPurchase: async () => view({ action: { type: "approveInApp", url: null, post: false, fields: {}, instructions: null, bank: null } }), purchase });
    const c = new CheckoutController(backend, "coinPack", "starter", 0.99, { pollEveryMs: 1000 });
    await c.load();
    await c.choose(jazz);
    await c.submitDetails("03001234567", "123456");
    expect(c.snapshot().stage).toBe("approveInApp");
    await vi.advanceTimersByTimeAsync(3100);
    expect(purchase).toHaveBeenCalledTimes(3);
    c.setVisible(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(purchase).toHaveBeenCalledTimes(3);
    c.dispose();
  });
});
