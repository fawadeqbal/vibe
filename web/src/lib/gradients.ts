/**
 * Flutter's LinearGradient(begin, end) runs between two points of the box,
 * with colour bands perpendicular to that line in real pixels. CSS keywords
 * ("to bottom right") and SVG bounding-box gradients both skew the bands on
 * non-square boxes, so a 56×364 button would look different. This converts
 * the app's gradients to an exact CSS angle and stops for a given box size.
 */

/** An Alignment: (-1,-1) top-left … (1,1) bottom-right. */
export type Alignment = readonly [number, number];

export interface GradientSpec {
  begin: Alignment;
  end: Alignment;
  colors: readonly string[];
  stops?: readonly number[];
}

const TL: Alignment = [-1, -1];
const BR: Alignment = [1, 1];

/** The app's gradients (V.brand, V.goldGrad, …). */
export const GRADIENTS = {
  brand: { begin: TL, end: BR, colors: ["#FF3D8F", "#8B5CF6"] },
  brandSoft: { begin: TL, end: BR, colors: ["rgb(255 61 143 / .2)", "rgb(139 92 246 / .2)"] },
  gold: { begin: TL, end: BR, colors: ["#FFD98A", "#F0A020"] },
  gem: { begin: TL, end: BR, colors: ["#8CF5E4", "#2DD4BF"] },
  /** Premium cards (VIP banner, VIP row on Me). */
  vipCard: { begin: [-0.35, -1], end: [0.35, 1], colors: ["#241B33", "#14111C"] },
  /** Report sheet's submit button. */
  bad: { begin: [-1, 0], end: [1, 0], colors: ["#FB7185", "#E11D48"] },
  /** Next button while the skip cooldown runs. */
  cooldown: { begin: [-1, 0], end: [1, 0], colors: ["#2E2840", "#241F31"] },
  walletCoins: { begin: TL, end: BR, colors: ["#2A2210", "#1A1724"] },
  walletGems: { begin: TL, end: BR, colors: ["#0E2E2B", "#1A1724"] },
} as const satisfies Record<string, GradientSpec>;

export type GradientName = keyof typeof GRADIENTS;

/** CSS `linear-gradient()` equal to the Flutter gradient on a w×h box. */
export function flutterGradientCss(g: GradientSpec, w: number, h: number): string {
  const stops = g.stops ?? g.colors.map((_, i) => (g.colors.length === 1 ? 0 : i / (g.colors.length - 1)));
  if (w <= 0 || h <= 0) return `linear-gradient(135deg, ${g.colors.map((c, i) => `${c} ${pct(stops[i])}`).join(", ")})`;
  // Points in pixels, origin at the centre.
  const ax = (g.begin[0] * w) / 2;
  const ay = (g.begin[1] * h) / 2;
  const bx = (g.end[0] * w) / 2;
  const by = (g.end[1] * h) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  // CSS angle: 0deg points up, 90deg right; direction (sin θ, -cos θ).
  const theta = Math.atan2(dx, -dy);
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  // CSS gradient line: through the centre, length |w sinθ| + |h cosθ|.
  const cssLen = Math.abs(w * sin) + Math.abs(h * cos);
  // Where the Flutter start point projects onto the CSS line (from its start).
  const ux = dx / len;
  const uy = dy / len;
  const startOnLine = ax * ux + ay * uy + cssLen / 2;
  const toCss = (t: number) => (startOnLine + t * len) / cssLen;
  const parts = g.colors.map((c, i) => `${c} ${pct(toCss(stops[i]))}`);
  return `linear-gradient(${((theta * 180) / Math.PI).toFixed(3)}deg, ${parts.join(", ")})`;
}

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
