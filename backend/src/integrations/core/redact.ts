/** Keys whose values never go into logs or the event trail. */
const SECRET = /pass(word)?|secret|salt|hash|signature|token|authorization|credential|private|pin|otp|cvv|pan\b|card_?number/i;
/** Keys that are personal: keep only the last 4 characters. */
const PERSONAL = /mobile|msisdn|phone|cnic|iban|account(no|number|_?num)?$|accountnum|email/i;

/** Deep copy of `value` that is safe to store in PaymentEvent/WebhookEvent rows. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET.test(k) && !/^(sub|subject)$/i.test(k)) out[k] = v === '' || v === undefined ? v : '[redacted]';
    else if (PERSONAL.test(k) && typeof v === 'string') out[k] = v.length > 4 ? `••${v.slice(-4)}` : '••';
    else out[k] = redact(v, depth + 1);
  }
  return out;
}
