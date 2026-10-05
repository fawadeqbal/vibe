import { newIdempotencyKey } from "./api/client";
import { ApiError } from "./api/errors";
import { isOpen, isLocalCurrency, type PaymentMethodOption, type PaymentOptions, type ProductKind, type PurchaseRequest, type PurchaseView } from "./payments";
import { cnicLast6, localMobile } from "./pk-validation";

/** Where a checkout is. The screen draws one view per stage. */
export type CheckoutStage =
  | "loading"
  /** Pick a method. */
  | "methods"
  /** Wallet number (+ CNIC) form. */
  | "details"
  /** Talking to the server. */
  | "processing"
  /** Type the code (dev wallets). */
  | "otp"
  /** Approve in the JazzCash / Easypaisa app. */
  | "approveInApp"
  /** Finishing on a hosted page (card, JazzCash page). */
  | "redirect"
  /** Bank details shown; staff confirm the transfer. */
  | "bankTransfer"
  | "succeeded"
  | "failed"
  | "expired";

/** What the controller needs from the server (the wallet store implements it). */
export interface CheckoutBackend {
  paymentOptions(): Promise<PaymentOptions>;
  createPurchase(r: PurchaseRequest, idempotencyKey: string): Promise<PurchaseView>;
  purchase(id: string): Promise<PurchaseView>;
  confirmPurchase(id: string, otp: string): Promise<PurchaseView>;
  checkPurchase(id: string): Promise<PurchaseView>;
  cancelPurchase(id: string): Promise<PurchaseView>;
  sendBankReference(id: string, reference: string): Promise<PurchaseView>;
  onPurchaseUpdate(fn: (p: PurchaseView) => void): () => void;
}

export interface CheckoutSnapshot {
  stage: CheckoutStage;
  options: PaymentOptions | null;
  method: PaymentMethodOption | null;
  purchase: PurchaseView | null;
  /** Inline problem on the current stage, or the failure reason on "failed". */
  error: string | null;
  busy: boolean;
  bankReferenceSent: boolean;
}

const WAITING: CheckoutStage[] = ["approveInApp", "redirect", "bankTransfer"];

/**
 * Drives one purchase (a pack or a plan) through the server's states: picks
 * the flow from the method, keeps one idempotency key per attempt, follows
 * `payment:updated` pushes and polls while a pending step is on screen.
 * UI-free (a port of the app's CheckoutController), so it is unit-tested with
 * a fake backend.
 */
export class CheckoutController {
  private s: CheckoutSnapshot = { stage: "loading", options: null, method: null, purchase: null, error: null, busy: false, bankReferenceSent: false };
  private listeners = new Set<() => void>();
  private key: string | null = null;
  private visible = true;
  private disposed = false;
  private poll: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly backend: CheckoutBackend,
    readonly kind: ProductKind,
    readonly productId: string,
    readonly usd: number,
    private readonly opts: { returnUrl?: string; pollEveryMs?: number; newKey?: () => string; fallbackPkrPerUsd?: number } = {},
  ) {
    this.activate();
  }

  /**
   * Listens for purchase pushes. Called by the constructor, and again by the
   * screen when it mounts: React (Strict Mode in development) can unmount and
   * remount the same screen, so dispose() must not be the end of the line.
   */
  activate() {
    this.disposed = false;
    this.unsubscribe ??= this.backend.onPurchaseUpdate((p) => {
      if (this.s.purchase?.id === p.id) this.apply(p, true);
    });
  }

  // ── reading ───────────────────────────────────────────────────────────

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  snapshot = () => this.s;

  get usdToPkr() {
    return this.s.options?.usdToPkr ?? this.opts.fallbackPkrPerUsd ?? 280;
  }

  /** PKR for local methods (the server's figure once known), USD otherwise. */
  get price(): { currency: string; amount: number } {
    const p = this.s.purchase;
    if (p) return { currency: p.currency, amount: p.amount };
    const m = this.s.method;
    if (m && isLocalCurrency(m)) return { currency: "PKR", amount: Math.round(this.usd * this.usdToPkr) };
    return { currency: "USD", amount: this.usd };
  }

  get waiting() {
    return WAITING.includes(this.s.stage);
  }

  // ── steps ─────────────────────────────────────────────────────────────

  async load() {
    this.set({ stage: "loading", error: null });
    try {
      const opts = await this.backend.paymentOptions();
      this.set({ options: opts });
      if (!opts.methods.length) this.fail("No payment method is available right now. Try again later.");
      else this.set({ stage: "methods" });
    } catch (e) {
      this.fail(message(e));
    }
  }

  /** Picks up a purchase started earlier (back from a hosted page in this tab). */
  async resume(purchaseId: string, returnStatus?: string) {
    this.set({ stage: "loading", error: null });
    try {
      const [opts, p] = await Promise.all([this.backend.paymentOptions(), this.backend.purchase(purchaseId)]);
      this.set({ options: opts, method: opts.methods.find((m) => m.method === p.method) ?? null });
      this.apply(p);
      if ((returnStatus === "cancelled" || returnStatus === "closed") && isOpen(p)) await this.cancel();
    } catch (e) {
      this.fail(message(e));
    }
  }

  async choose(m: PaymentMethodOption) {
    this.stopWatching();
    this.key = null; // a new attempt
    this.set({ method: m, error: null, purchase: null });
    if (m.flow === "wallet") this.set({ stage: "details" });
    else await this.start();
  }

  /** The wallet form. JazzCash also wants the last 6 digits of the CNIC. */
  async submitDetails(phone: string, cnic = "") {
    const m = this.s.method;
    if (!m) return;
    const mobile = localMobile(phone);
    if (!mobile) return this.set({ error: `Enter your ${m.label} number like 03001234567.` });
    const needsCnic = m.needs.includes("cnicLast6");
    if (needsCnic && !cnicLast6(cnic)) return this.set({ error: "Enter the last 6 digits of your CNIC." });
    await this.start({ phone: mobile, cnicLast6: needsCnic ? cnic.trim() : undefined });
  }

  /** JazzCash without the wallet API: pay on JazzCash's own page instead. */
  payOnProviderPage = () => this.start();

  private async start(extra: { phone?: string; cnicLast6?: string } = {}) {
    const m = this.s.method!;
    this.key ??= (this.opts.newKey ?? newIdempotencyKey)();
    this.set({ stage: "processing", error: null });
    try {
      const p = await this.backend.createPurchase(
        {
          productType: this.kind,
          productId: this.productId,
          method: m.method,
          ...extra,
          returnUrl: m.flow === "redirect" || m.method === "jazzCash" ? this.opts.returnUrl : undefined,
        },
        this.key,
      );
      this.apply(p);
    } catch (e) {
      // A declined charge closes this attempt; the next try gets a new key.
      this.key = null;
      if (e instanceof ApiError && e.code === "VALIDATION_FAILED" && m.flow === "wallet") this.set({ stage: "details", error: e.message });
      else this.fail(message(e));
    }
  }

  async confirmOtp(code: string) {
    const p = this.s.purchase;
    if (!p) return;
    if (!/^\d{4,6}$/.test(code.trim())) return this.set({ error: "Enter the code you received." });
    await this.call(() => this.backend.confirmPurchase(p.id, code.trim()));
  }

  /** "I've approved" / "I've paid": asks the provider now. */
  async checkNow() {
    const p = this.s.purchase;
    if (p) await this.call(() => this.backend.checkPurchase(p.id));
  }

  /** Re-reads the purchase (polling, tab visible again, back from a hosted page). */
  async refresh() {
    const p = this.s.purchase;
    if (!p || this.s.busy) return;
    try {
      this.apply(await this.backend.purchase(p.id), true);
    } catch {
      // Polling is best effort.
    }
  }

  async cancel() {
    const p = this.s.purchase;
    if (!p) return this.set({ stage: "methods" });
    await this.call(() => this.backend.cancelPurchase(p.id));
  }

  async sendBankReference(reference: string) {
    const p = this.s.purchase;
    if (!p) return;
    if (reference.trim().length < 3) return this.set({ error: "Enter the reference from your bank app." });
    await this.call(() => this.backend.sendBankReference(p.id, reference));
    if (!this.s.error) this.set({ bankReferenceSent: true });
  }

  /** Back from a hosted page (the return page reported in). */
  async onReturn(r: { purchaseId?: string | null; status?: string | null }) {
    const p = this.s.purchase;
    if (!p || (r.purchaseId && r.purchaseId !== p.id)) return;
    if ((r.status === "cancelled" || r.status === "closed") && isOpen(p)) await this.cancel();
    else await this.refresh();
  }

  /** Try the same method again (a new attempt, new idempotency key). */
  async retry() {
    const m = this.s.method;
    if (!m) return this.load();
    await this.choose(m);
  }

  chooseAnother = () => {
    this.stopWatching();
    this.key = null;
    this.set({ purchase: null, error: null, stage: this.s.options ? "methods" : "loading" });
    if (!this.s.options) void this.load();
  };

  /** Polling only runs while someone looks. */
  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible && this.waiting) {
      void this.refresh();
      this.watch();
    } else if (!visible) this.stopWatching();
  }

  /** Stops pushes and polling until activate() is called again. */
  dispose() {
    this.disposed = true;
    this.stopWatching();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ── internals ─────────────────────────────────────────────────────────

  private set(patch: Partial<CheckoutSnapshot>) {
    if (this.disposed) return;
    this.s = { ...this.s, ...patch };
    this.listeners.forEach((l) => l());
  }

  private async call(fn: () => Promise<PurchaseView>) {
    this.set({ busy: true, error: null });
    try {
      this.apply(await fn());
    } catch (e) {
      if (e instanceof ApiError && e.code === "PAYMENT_DECLINED") this.fail(e.message);
      else this.set({ error: message(e) });
    } finally {
      this.set({ busy: false });
    }
  }

  /** Maps the server's view of the purchase to a stage. */
  private apply(p: PurchaseView, quiet = false) {
    if (this.disposed) return;
    const cur = this.s.purchase;
    // Pushes and polls can arrive out of order: never reopen a closed purchase.
    if (cur && cur.id === p.id && !isOpen(cur) && isOpen(p)) return;
    const next: CheckoutStage =
      p.state === "succeeded"
        ? "succeeded"
        : p.state === "failed" || p.state === "refunded"
          ? "failed"
          : p.state === "expired"
            ? "expired"
            : p.action?.type === "otp"
              ? "otp"
              : p.action?.type === "redirect"
                ? "redirect"
                : p.action?.type === "bankTransfer"
                  ? "bankTransfer"
                  : "approveInApp";
    // A quiet refresh must not throw people out of the field they are typing in.
    if (quiet && next === this.s.stage && cur?.state === p.state) {
      this.s = { ...this.s, purchase: p };
      return;
    }
    this.set({
      purchase: p,
      stage: next,
      ...(next === "failed" ? { error: p.failureReason ?? "The payment did not go through." } : {}),
      ...(next === "expired" ? { error: p.failureReason ?? "The payment was not completed in time." } : {}),
    });
    if (this.waiting) this.watch();
    else this.stopWatching();
  }

  private fail(msg: string) {
    this.stopWatching();
    this.set({ error: msg, stage: "failed" });
  }

  private watch() {
    if (!this.visible || this.poll || !this.s.purchase) return;
    this.poll = setInterval(() => void this.refresh(), this.opts.pollEveryMs ?? 3000);
  }

  private stopWatching() {
    clearInterval(this.poll);
    this.poll = undefined;
  }
}

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong");
