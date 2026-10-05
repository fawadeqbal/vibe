/** Theme colour names (globals.css `--color-*`) that components accept as props. */
export type Tone =
  | "pink"
  | "pink-soft"
  | "violet"
  | "lavender"
  | "gold"
  | "gem"
  | "trust"
  | "ok"
  | "bad"
  | "warn"
  | "text"
  | "text2"
  | "muted"
  | "white"
  | "jazzcash"
  | "easypaisa";

/** The colour as a CSS value. */
export const color = (t: Tone) => `var(--color-${t})`;

/** The colour at `a` (0–1) opacity — Flutter's `withValues(alpha: a)`. */
export const alpha = (t: Tone, a: number) => `color-mix(in srgb, var(--color-${t}) ${Math.round(a * 1000) / 10}%, transparent)`;
