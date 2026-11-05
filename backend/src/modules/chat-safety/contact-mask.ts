/**
 * Hides contact details in chat text: phone numbers, chat-app and social
 * handles or links, and e-mail addresses become "****". Only the matched
 * part is replaced; the rest of the message goes through as written.
 *
 * Pure (no I/O) and unit-tested in contact-mask.spec.ts. Tuned to catch the
 * usual tricks — spaces and dashes between digits, Urdu/Arabic digits, O/l
 * for 0/1, numbers spelled out in English or Roman Urdu, "ali (at) gmail
 * dot com" — while leaving prices, years, dates, times and scores alone.
 */

export const MASK = '****';

export type HiddenKind = 'phone' | 'social' | 'email' | 'link';

export interface MaskResult {
  text: string;
  /** What was hidden; empty when nothing was. */
  hidden: HiddenKind[];
}

export interface MaskOptions {
  /** Also hide any web link (random calls: strangers, so links are never needed). */
  links?: boolean;
}

/** A phone number has at least this many digits (Pakistani mobiles have 11). */
const PHONE_DIGITS = 7;

const URDU_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Number words, English and Roman Urdu → digit. */
const NUMBER_WORDS: Record<string, string> = {
  zero: '0', oh: '0', sifar: '0', sifr: '0',
  one: '1', aik: '1', ek: '1', ik: '1',
  two: '2', do: '2', to: '2', too: '2',
  three: '3', teen: '3', tin: '3',
  four: '4', for: '4', char: '4', chaar: '4',
  five: '5', panch: '5', paanch: '5', panj: '5',
  six: '6', chay: '6', chhe: '6', chhay: '6', che: '6',
  seven: '7', saat: '7', sat: '7',
  eight: '8', aath: '8', ath: '8', aat: '8',
  nine: '9', nau: '9', no: '9', naw: '9',
};
/** Words that only count as digits inside a run of other number words ("to", "for", "no"…). */
const WEAK_WORDS = new Set(['oh', 'to', 'too', 'for', 'no', 'do', 'ik', 'tin', 'sat', 'che', 'ath', 'aat']);

/** "۰۳۰۰" → "0300"; other characters unchanged. */
export function westernDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(URDU_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/** The digits a token stands for, or null when it isn't number-like ("03OO-12", "۰۳۰۰", "seven"). */
export function tokenDigits(raw: string): string | null {
  const t = westernDigits(raw).replace(/^[([{"'“]+|[)\]}"'”.,!?;:]+$/g, '');
  if (!t) return null;
  const word = NUMBER_WORDS[t.toLowerCase()];
  if (word !== undefined) return word;
  // Digits with separators and look-alike letters (O for 0, l/I for 1) — but at least one real digit.
  if (!/\d/.test(t) || !/^\+?[\dOoIl\-./()*#_|]+$/.test(t)) return null;
  return t.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/\D/g, '');
}

/** "04/11/2026", "4-11-26", "2020-2026", "2025 2026": dates and years, not phone numbers. */
const looksLikeDate = (s: string) => {
  const t = westernDigits(s).trim();
  return /^\d{1,2}[/.-]\d{1,2}[/.-](\d{2}|\d{4})$/.test(t) || /^(?:(?:19|20)\d\d[\s/–-]*){2,3}$/.test(t);
};

interface Token {
  start: number;
  end: number;
  raw: string;
  digits: string | null;
  weak: boolean;
}

function tokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const raw = m[0];
    out.push({ start: m.index, end: m.index + raw.length, raw, digits: tokenDigits(raw), weak: WEAK_WORDS.has(raw.toLowerCase().replace(/[.,!?]+$/, '')) });
  }
  return out;
}

/**
 * Runs of number-like tokens that add up to a phone number: "0300 1234567",
 * "+92-300-1234567", "zero three zero zero …". Returns [start, end) spans.
 */
function phoneSpans(text: string): [number, number][] {
  const ts = tokens(text);
  const spans: [number, number][] = [];
  let i = 0;
  while (i < ts.length) {
    if (ts[i].digits === null || ts[i].weak) {
      i++;
      continue;
    }
    let j = i;
    let digits = '';
    while (j < ts.length && ts[j].digits !== null) {
      digits += ts[j].digits;
      j++;
    }
    // Trim weak words ("to", "for") hanging off the end: "call me 0300 1234567 to talk".
    let last = j - 1;
    while (last > i && ts[last].weak) {
      digits = digits.slice(0, digits.length - (ts[last].digits?.length ?? 0));
      last--;
    }
    const run = text.slice(ts[i].start, ts[last].end);
    // Keep punctuation after the number: "0300 1234567, insta…" → "****, insta…".
    const tail = /[.,!?;:]+$/.exec(ts[last].raw)?.[0].length ?? 0;
    if (digits.length >= PHONE_DIGITS && !looksLikeDate(run)) spans.push([ts[i].start, ts[last].end - tail]);
    i = j;
  }
  return spans;
}

const SOCIAL_WORDS = 'insta|instagram|ig|snap|snapchat|tele|telegram|tg|tiktok|tik tok|fb|facebook|whats ?app|watsapp|whatsap|wp|imo|signal|viber|discord|twitter';

const RULES: { kind: HiddenKind; re: RegExp; keep?: (m: string) => boolean }[] = [
  // Links to chat apps and social profiles.
  {
    kind: 'social',
    re: /(?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|m\.me|instagram\.com|instagr\.am|snapchat\.com|facebook\.com|fb\.com|fb\.me|tiktok\.com|twitter\.com|x\.com|discord\.gg|discord\.com)\/\S*/gi,
  },
  // E-mail as written…
  { kind: 'email', re: /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi },
  // …and spelled out: "ali (at) gmail dot com", "ali [at] mail.pk".
  { kind: 'email', re: /[a-z0-9._%+-]+\s*(?:\(at\)|\[at\])\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*[a-z]{2,}/gi },
  // "ali at gmail.com" / "ali at gmail dot com": only with a known mail provider, so "meet at cafe.com" stays.
  { kind: 'email', re: /[a-z0-9._%+-]+\s+at\s+(?:gmail|googlemail|yahoo|ymail|hotmail|outlook|live|icloud|proton(?:mail)?)\s*(?:\.|\sdot\s)\s*[a-z]{2,}/gi },
  // @handles.
  { kind: 'social', re: /(?<=^|[\s(])@[a-z0-9._]{3,}/gi },
  // A handle right after an app name: "insta ali.khan22", "snap id: ali_22".
  {
    kind: 'social',
    re: new RegExp(`(?<=\\b(?:${SOCIAL_WORDS})\\s*(?:id|is|pe|par|on|handle|username)?\\s*[:=-]?\\s*)[a-z0-9._]{3,}`, 'gi'),
    keep: (m) => !/[\d._]/.test(m), // "insta is fun" stays; "ali.khan" / "ali_22" don't
  },
];

/** Any web address (only hidden when `links` is on). */
const ANY_LINK = /(?:https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|net|org|pk|io|me|co|app|link|xyz|site|online|info|ly|gg)(?:\/\S*)?)/gi;

function mergeSpans(spans: [number, number][]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([...s]);
  }
  return out;
}

/** Hides contact details. Nothing found → the text comes back unchanged. */
export function maskContacts(text: string, opts: MaskOptions = {}): MaskResult {
  const hidden = new Set<HiddenKind>();
  const spans: [number, number][] = [];
  const add = (kind: HiddenKind, s: number, e: number) => {
    hidden.add(kind);
    spans.push([s, e]);
  };
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      if (r.keep?.(m[0])) continue;
      add(r.kind, m.index, m.index + m[0].length);
    }
  }
  for (const [s, e] of phoneSpans(text)) add('phone', s, e);
  if (opts.links) for (const m of text.matchAll(ANY_LINK)) add('link', m.index, m.index + m[0].length);
  if (!spans.length) return { text, hidden: [] };

  let out = '';
  let at = 0;
  for (const [s, e] of mergeSpans(spans)) {
    out += text.slice(at, s) + MASK;
    at = e;
  }
  out += text.slice(at);
  return { text: out.replace(/(\*{4}[\s,.\-/]*){2,}/g, `${MASK} `).trim(), hidden: [...hidden] };
}

/**
 * A message that is only a number fragment ("0300", "123 4567"): its digits,
 * else null. Used to catch a number sent a few digits at a time.
 */
export function fragmentDigits(text: string): string | null {
  const ts = tokens(text.trim());
  if (!ts.length || ts.some((t) => t.digits === null)) return null;
  const d = ts.map((t) => t.digits).join('');
  return d.length ? d : null;
}

/** With the fragments sent just before, does this one complete a phone number? */
export function completesNumber(before: string, fragment: string): boolean {
  return before.length > 0 && (before + fragment).length >= PHONE_DIGITS;
}
