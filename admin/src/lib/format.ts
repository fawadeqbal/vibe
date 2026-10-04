import { formatDistanceToNowStrict, format as fmt } from "date-fns";

const nf = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

/** Formatting in one place so every screen shows numbers, money and time the same way. */
export const format = {
  number: (n: number | null | undefined) => (n == null ? "—" : nf.format(n)),
  compact: (n: number | null | undefined) => (n == null ? "—" : n >= 10_000 ? compact.format(n) : nf.format(n)),
  usd: (n: number | null | undefined) => (n == null ? "—" : usd.format(n)),
  usdRound: (n: number | null | undefined) => (n == null ? "—" : n >= 1000 ? usd0.format(n) : usd.format(n)),
  cents: (c: number | null | undefined) => (c == null ? "—" : usd.format(c / 100)),
  percent: (n: number | null | undefined) => (n == null ? "—" : pct.format(n)),
  signed: (n: number) => (n > 0 ? `+${nf.format(n)}` : nf.format(n)),
  date: (iso: string | null | undefined) => (iso ? fmt(new Date(iso), "d MMM yyyy") : "—"),
  dateTime: (iso: string | null | undefined) => (iso ? fmt(new Date(iso), "d MMM yyyy, HH:mm") : "—"),
  time: (iso: string | null | undefined) => (iso ? fmt(new Date(iso), "HH:mm:ss") : "—"),
  ago: (iso: string | null | undefined) => (iso ? `${formatDistanceToNowStrict(new Date(iso))} ago` : "—"),
  until: (iso: string | null | undefined) => (iso ? `in ${formatDistanceToNowStrict(new Date(iso))}` : "—"),
  /** "3 hours ago" or "in 2 days", whichever side of now it is. */
  relative: (iso: string | null | undefined) => (!iso ? "—" : new Date(iso).getTime() > Date.now() ? `in ${formatDistanceToNowStrict(new Date(iso))}` : `${formatDistanceToNowStrict(new Date(iso))} ago`),
  duration: (seconds: number | null | undefined) => {
    if (seconds == null) return "—";
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  },
  /** "GOOGLE_PLAY" → "Google Play" */
  enum: (v: string | null | undefined) =>
    v
      ? v
          .toLowerCase()
          .split("_")
          .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
          .join(" ")
          .replace("Jazzcash", "JazzCash")
          .replace("Google play", "Google Play")
          .replace("App store", "App Store")
          .replace("Non vip", "Non-VIP")
          .replace(/^Vip$/, "VIP")
      : "—",
  initials: (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?",
};

export const flag = (cc: string | null | undefined): string =>
  cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🌍";
