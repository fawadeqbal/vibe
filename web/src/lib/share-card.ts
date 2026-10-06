/**
 * Share cards: a branded PNG (canvas) plus a line of text with your invite
 * link, for the Progress card ("I'm Level 12 on Vibe"), a friend streak and
 * a mutual like. Text is pure (tested); drawing needs a browser canvas.
 * Never puts the other person's name or photo on the card.
 */
export type ShareCard = { kind: "level"; level: number } | { kind: "streak"; days: number } | { kind: "match" };

export interface CardCopy {
  eyebrow: string;
  title: string;
  accent: string;
  sub: string;
}

export function cardCopy(card: ShareCard, brand = "Vibe"): CardCopy {
  switch (card.kind) {
    case "level":
      return { eyebrow: "Level up", title: `I'm Level ${card.level}`, accent: `on ${brand}.`, sub: "Good calls, likes and streaks got me here." };
    case "streak":
      return { eyebrow: "Friend streak", title: `Our ${card.days}-day streak`, accent: "still going.", sub: `We've talked every day for ${card.days} ${card.days === 1 ? "day" : "days"}.` };
    case "match":
      return { eyebrow: "Mutual like", title: "It's a", accent: "vibe!", sub: "Met someone great on a video call today." };
  }
}

/** The message that goes with the card: what happened, then the invite and its reward. */
export function shareText(card: ShareCard, link: string, inviteeCoins: number, brand = "Vibe"): string {
  const lead =
    card.kind === "level"
      ? `I'm Level ${card.level} on ${brand} 🎉`
      : card.kind === "streak"
        ? `Our ${card.days}-day streak on ${brand} 🔥`
        : `It's a vibe! 💞 Just met someone great on ${brand}.`;
  const invite = inviteeCoins > 0 ? `Meet new people on video — join with my link and get ${inviteeCoins} free coins:` : "Meet new people on video — join with my link:";
  return `${lead} ${invite} ${link}`;
}

/** `vibe.fawadiqbal.dev/i/K7P2QXM` — the link as printed on the card. */
export const printableLink = (link: string) => link.replace(/^https?:\/\//, "").replace(/\?.*$/, "");

// ── drawing (browser only) ──────────────────────────────────────────────────

export const CARD_W = 1080;
export const CARD_H = 1350;

const C = { bg: "#0b0a10", surface: "#1a1724", text: "#f4f1fa", text2: "#b9b3c9", pink: "#ff3d8f", pinkSoft: "#ff7ab3", violet: "#8b5cf6", gold: "#ffc857", flame: "#ff8a3d", line: "rgba(255,255,255,0.10)" };

function cssFont(variable: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rings(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, stroke: number) {
  const r = (size * 0.62) / 2;
  const off = size * 0.19 - stroke / 4;
  ctx.lineWidth = stroke;
  ctx.strokeStyle = C.pink;
  ctx.beginPath();
  ctx.arc(cx - off, cy, r - stroke / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = C.violet;
  ctx.beginPath();
  ctx.arc(cx + off, cy, r - stroke / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the card and returns it as a PNG. */
export async function renderShareCard(card: ShareCard, opts: { link: string; inviteeCoins: number; brand?: string }): Promise<Blob> {
  const brand = opts.brand ?? "Vibe";
  const sans = cssFont("--font-geist", "ui-sans-serif, system-ui, sans-serif");
  const serif = cssFont("--font-instrument-serif", "Georgia, serif");
  const icons = "'Material Icons Round'";
  try {
    await Promise.all([document.fonts.load(`700 92px ${sans}`), document.fonts.load(`italic 400 110px ${serif}`), document.fonts.load(`300px ${icons}`, "local_fire_department")]);
  } catch {}

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available in this browser.");
  const copy = cardCopy(card, brand);
  const cx = CARD_W / 2;

  // Ground and glows.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  };
  glow(cx, 430, 620, "139,92,246", 0.32);
  glow(cx, CARD_H + 80, 640, "255,61,143", 0.2);

  // Brand.
  rings(ctx, 112, 112, 64, 6);
  ctx.fillStyle = C.text;
  ctx.font = `700 46px ${sans}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(brand, 160, 114);

  // The moment.
  const gy = 470;
  if (card.kind === "level") {
    const r = 190;
    ctx.lineCap = "round";
    ctx.lineWidth = 30;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(cx, gy, r, 0, Math.PI * 2);
    ctx.stroke();
    const grad = ctx.createLinearGradient(cx - r, gy - r, cx + r, gy + r);
    grad.addColorStop(0, C.pink);
    grad.addColorStop(1, C.violet);
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, gy, r, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = C.text2;
    ctx.font = `600 34px ${sans}`;
    ctx.fillText("LEVEL", cx, gy - 92);
    ctx.fillStyle = C.text;
    ctx.font = `700 ${card.level >= 100 ? 150 : 190}px ${sans}`;
    ctx.fillText(String(card.level), cx, gy + 22);
  } else if (card.kind === "streak") {
    ctx.save();
    ctx.shadowColor = "rgba(255,138,61,0.55)";
    ctx.shadowBlur = 80;
    ctx.fillStyle = C.flame;
    ctx.textAlign = "center";
    ctx.font = `300px ${icons}`;
    ctx.fillText("local_fire_department", cx, gy - 30);
    ctx.restore();
    ctx.textAlign = "center";
    ctx.fillStyle = C.text;
    ctx.font = `700 120px ${sans}`;
    ctx.fillText(`${card.days}`, cx, gy + 180);
  } else {
    rings(ctx, cx, gy, 520, 30);
    ctx.save();
    ctx.shadowColor = "rgba(255,61,143,0.6)";
    ctx.shadowBlur = 60;
    ctx.fillStyle = C.pinkSoft;
    ctx.textAlign = "center";
    ctx.font = `120px ${icons}`;
    ctx.fillText("favorite", cx, gy + 4);
    ctx.restore();
  }

  // Headline: Geist + one Instrument Serif accent.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.pinkSoft;
  ctx.font = `600 30px ${sans}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "5px";
  ctx.fillText(copy.eyebrow.toUpperCase(), cx, 800);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.fillStyle = C.text;
  ctx.font = `700 96px ${sans}`;
  const titleW = ctx.measureText(`${copy.title} `).width;
  ctx.font = `italic 400 112px ${serif}`;
  const accentW = ctx.measureText(copy.accent).width;
  if (titleW + accentW <= CARD_W - 120) {
    const x0 = cx - (titleW + accentW) / 2;
    ctx.textAlign = "left";
    ctx.font = `700 96px ${sans}`;
    ctx.fillText(`${copy.title} `, x0, 912);
    ctx.fillStyle = C.pinkSoft;
    ctx.font = `italic 400 112px ${serif}`;
    ctx.fillText(copy.accent, x0 + titleW, 912);
  } else {
    ctx.font = `700 88px ${sans}`;
    ctx.fillText(copy.title, cx, 892);
    ctx.fillStyle = C.pinkSoft;
    ctx.font = `italic 400 104px ${serif}`;
    ctx.fillText(copy.accent, cx, 990);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = C.text2;
  ctx.font = `400 38px ${sans}`;
  wrap(ctx, copy.sub, CARD_W - 200).forEach((l, i) => ctx.fillText(l, cx, 1060 + i * 50));

  // The invite: what they get (gold = coins) and where.
  const pillW = 860;
  const pillH = 150;
  const px = cx - pillW / 2;
  const py = CARD_H - 70 - pillH;
  roundRect(ctx, px, py, pillW, pillH, 40);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.line;
  ctx.stroke();
  ctx.fillStyle = C.gold;
  ctx.font = `700 38px ${sans}`;
  ctx.fillText(opts.inviteeCoins > 0 ? `Join with my link · get ${opts.inviteeCoins} free coins` : `Join me on ${brand}`, cx, py + 62);
  ctx.fillStyle = C.text2;
  ctx.font = `500 32px ${sans}`;
  ctx.fillText(printableLink(opts.link), cx, py + 112);

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the card."))), "image/png"));
}
