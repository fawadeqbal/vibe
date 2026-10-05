/**
 * Payments, payouts, sign-in identities and verification as the Vibe API
 * describes them (mirror of the Flutter `payments.dart`). Screens never read
 * raw JSON; they read these.
 */
import { asList, asMap, bool, date, int, type Json, num, optStr, paymentMethodFromApi, paymentMethodToApi, str } from "./api/mappers";
import type { PaymentMethod } from "./models";

// ── what can be paid with ────────────────────────────────────────────────

/** How a method collects money (drives the checkout UI). */
export type PaymentFlow = "store" | "wallet" | "redirect" | "manual";

export interface PaymentMethodOption {
  method: PaymentMethod;
  flow: PaymentFlow;
  label: string;
  /** False while the server runs this method's dev stand-in. */
  live: boolean;
  /** 'USD' (stores) or 'PKR' (local methods). */
  currency: string;
  /** Fields to collect first: 'receipt', 'phone', 'cnicLast6'. */
  needs: string[];
}

export const isLocalCurrency = (o: PaymentMethodOption) => o.currency === "PKR";

export interface PaymentOptions {
  methods: PaymentMethodOption[];
  usdToPkr: number;
}

const FLOWS: PaymentFlow[] = ["store", "wallet", "redirect"];

/** The methods the server offers, without the app stores (no store billing on the web). */
export function parsePaymentOptions(m: Json, fallbackPkrPerUsd: number): PaymentOptions {
  const methods: PaymentMethodOption[] = [];
  for (const raw of asList(m.methods)) {
    const e = asMap(raw);
    const method = paymentMethodFromApi(e.method);
    if (!method || method === "googlePlay" || method === "appStore") continue;
    methods.push({
      method,
      flow: FLOWS.includes(e.flow as PaymentFlow) ? (e.flow as PaymentFlow) : "manual",
      label: optStr(e.label) ?? method,
      live: e.mode === "live",
      currency: optStr(e.currency) ?? "USD",
      needs: asList(e.needs).filter((x): x is string => typeof x === "string"),
    });
  }
  const rate = num(m.usdToPkr);
  return { methods, usdToPkr: rate > 0 ? rate : fallbackPkrPerUsd };
}

// ── a purchase ───────────────────────────────────────────────────────────

export type ProductKind = "coinPack" | "vipPlan";
export const productKindToApi = (k: ProductKind) => (k === "coinPack" ? "COIN_PACK" : "VIP_PLAN");
export const productKindFromApi = (v: unknown): ProductKind => (v === "VIP_PLAN" ? "vipPlan" : "coinPack");

export type PurchaseState = "pending" | "requiresAction" | "succeeded" | "failed" | "refunded" | "expired";

const PURCHASE_STATES: Record<string, PurchaseState> = {
  REQUIRES_ACTION: "requiresAction",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  REFUNDED: "refunded",
  EXPIRED: "expired",
};

export type PaymentActionType = "otp" | "approveInApp" | "redirect" | "bankTransfer" | "unknown";

export interface BankDetails {
  bankName: string;
  accountTitle: string;
  iban: string;
  reference: string;
  amount: string;
}

/** What the person must do to finish a pending payment. */
export interface PaymentAction {
  type: PaymentActionType;
  /** redirect: where to go; `post` = form-POST `fields` there (JazzCash hosted page). */
  url: string | null;
  post: boolean;
  fields: Record<string, string>;
  instructions: string | null;
  bank: BankDetails | null;
}

function parseAction(v: unknown): PaymentAction | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Json;
  const types: Record<string, PaymentActionType> = { otp: "otp", approve_in_app: "approveInApp", redirect: "redirect", bank_transfer: "bankTransfer" };
  const b = m.bank && typeof m.bank === "object" ? (m.bank as Json) : null;
  return {
    type: types[str(m.type)] ?? "unknown",
    url: optStr(m.url),
    post: m.method === "POST",
    fields: Object.fromEntries(Object.entries(asMap(m.fields)).map(([k, x]) => [k, String(x)])),
    instructions: optStr(m.instructions),
    bank: b ? { bankName: str(b.bankName), accountTitle: str(b.accountTitle), iban: str(b.iban), reference: str(b.reference), amount: String(b.amount ?? "") } : null,
  };
}

/** `PurchaseView` from the API (also the `payment:updated` payload). */
export interface PurchaseView {
  id: string;
  state: PurchaseState;
  productType: ProductKind;
  productId: string;
  method: PaymentMethod | null;
  usd: number;
  /** What is charged: USD for stores, PKR for local methods. */
  currency: string;
  amount: number;
  receipt: string | null;
  action: PaymentAction | null;
  expiresAt: Date | null;
  failureReason: string | null;
  completedAt: Date | null;
  /** The raw wallet view when the purchase succeeded in this response. */
  wallet: Json | null;
}

export const isOpen = (p: PurchaseView) => p.state === "pending" || p.state === "requiresAction";

export function parsePurchase(m: Json): PurchaseView {
  const amount = asMap(m.amount);
  const hasAmount = Object.keys(amount).length > 0;
  return {
    id: String(m.id ?? ""),
    state: PURCHASE_STATES[str(m.status)] ?? "pending",
    productType: productKindFromApi(m.productType),
    productId: str(m.productId),
    method: paymentMethodFromApi(m.method),
    usd: num(m.usd),
    currency: optStr(amount.currency) ?? "USD",
    amount: hasAmount ? num(amount.value) : num(m.usd),
    receipt: optStr(m.receipt),
    action: parseAction(m.action),
    expiresAt: date(m.expiresAt),
    failureReason: optStr(m.failureReason),
    completedAt: date(m.completedAt),
    wallet: m.wallet && typeof m.wallet === "object" ? (m.wallet as Json) : null,
  };
}

/** One checkout attempt as sent to `POST /payments/purchases`. */
export interface PurchaseRequest {
  productType: ProductKind;
  productId: string;
  method: PaymentMethod;
  phone?: string;
  cnicLast6?: string;
  returnUrl?: string;
}

export function purchaseRequestJson(r: PurchaseRequest): Json {
  return {
    productType: productKindToApi(r.productType),
    productId: r.productId,
    method: paymentMethodToApi(r.method),
    ...(r.phone ? { phone: r.phone.replace(/[^0-9+]/g, "") } : {}),
    ...(r.cnicLast6 ? { cnicLast6: r.cnicLast6 } : {}),
    ...(r.returnUrl ? { returnUrl: r.returnUrl } : {}),
  };
}

// ── payouts (gems → money) ───────────────────────────────────────────────

export interface PayoutAccount {
  id: string;
  method: PaymentMethod;
  accountMasked: string;
  holderName: string;
  bankName: string | null;
  isDefault: boolean;
}

export const parsePayoutAccount = (m: Json): PayoutAccount => ({
  id: String(m.id ?? ""),
  method: paymentMethodFromApi(m.method) ?? "bank",
  accountMasked: str(m.accountMasked),
  holderName: str(m.holderName),
  bankName: optStr(m.bankName),
  isDefault: bool(m.isDefault),
});

export interface NewPayoutAccount {
  method: PaymentMethod;
  account: string;
  holderName: string;
  bankName?: string;
  makeDefault: boolean;
}

export type CashoutStatus = "review" | "requested" | "processing" | "paid" | "rejected";

export const cashoutStatusFromApi = (s: unknown): CashoutStatus =>
  s === "REVIEW" ? "review" : s === "PROCESSING" ? "processing" : s === "PAID" ? "paid" : s === "REJECTED" ? "rejected" : "requested";

export const cashoutStatusLabel: Record<CashoutStatus, string> = {
  review: "In review",
  requested: "Requested",
  processing: "Sending",
  paid: "Paid",
  rejected: "Returned",
};

export interface Cashout {
  id: string;
  gems: number;
  usd: number;
  amountPkr: number | null;
  method: PaymentMethod;
  accountMasked: string;
  status: CashoutStatus;
  failureReason: string | null;
  createdAt: Date | null;
}

export const parseCashout = (m: Json): Cashout => ({
  id: String(m.id ?? ""),
  gems: int(m.gems),
  usd: num(m.usdCents) / 100,
  amountPkr: typeof m.amountPkr === "number" ? Math.trunc(m.amountPkr) : null,
  method: paymentMethodFromApi(m.method) ?? "bank",
  accountMasked: str(m.accountMasked),
  status: cashoutStatusFromApi(m.status),
  failureReason: optStr(m.failureReason),
  createdAt: date(m.createdAt),
});

// ── sign-in identities ───────────────────────────────────────────────────

export type SocialProvider = "google" | "apple" | "facebook";

/** A credential from a provider, as `POST /auth/social` takes it. */
export interface SocialCredential {
  provider: string;
  idToken?: string;
  accessToken?: string;
  nonce?: string;
  name?: string;
}

export interface LinkedIdentity {
  provider: string;
  email: string | null;
}

export interface IdentitiesView {
  email: string | null;
  identities: LinkedIdentity[];
  /** Providers the server can link now (lower-case). */
  available: string[];
}

export const parseIdentities = (m: Json): IdentitiesView => ({
  email: optStr(m.email),
  identities: asList(m.identities).map((e) => ({ provider: str(asMap(e).provider).toLowerCase(), email: optStr(asMap(e).email) })),
  available: asList(m.available).map((p) => String(p).toLowerCase()),
});

export const socialProviderLabel = (p: string) => (p === "google" ? "Google" : p === "apple" ? "Apple" : p === "facebook" ? "Facebook" : p);

// ── selfie verification ──────────────────────────────────────────────────

export type VerificationStatus = "none" | "pending" | "approved" | "rejected";

export interface VerificationState {
  status: VerificationStatus;
  reason: string | null;
}

export const NO_VERIFICATION: VerificationState = { status: "none", reason: null };

export const parseVerification = (m: Json): VerificationState => ({
  status: m.status === "PENDING" ? "pending" : m.status === "APPROVED" ? "approved" : m.status === "REJECTED" ? "rejected" : "none",
  reason: optStr(m.reason),
});

// ── VIP subscription ─────────────────────────────────────────────────────

/** `GET /vip`: how the current VIP is billed and where to manage it. */
export interface VipStatus {
  active: boolean;
  until: Date | null;
  method: PaymentMethod | null;
  /** Store subscriptions are cancelled in the store: open this. */
  manageUrl: string | null;
}

export const parseVipStatus = (m: Json): VipStatus => ({
  active: bool(m.active),
  until: date(m.until),
  method: paymentMethodFromApi(m.method),
  manageUrl: optStr(m.manageUrl),
});

export const managedByStore = (s: VipStatus | null) => !!s?.manageUrl && (s.method === "googlePlay" || s.method === "appStore");
