/**
 * Keeps calls going on weak and expensive connections. Every two seconds the
 * call reads its own stats (how fast we can send, how much is lost, how long
 * a round trip takes), picks a level, and sends video to match it: sharp when
 * the line is good, smaller and slower when it isn't, and none at all when
 * even that won't fit — voice always goes first. Data saver caps the level.
 *
 * The same rules are in the app (lib/services/calls/call_quality.dart).
 */

export type CallLevel = "good" | "fair" | "poor" | "audio";

/** What the sender does at a level. `video: false` = video paused, voice only. */
export interface SendProfile {
  video: boolean;
  /** bits per second */
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
}

/** Camera capture (before the encoder scales it down): 640×480 is plenty for a phone-sized tile. */
export const CAPTURE = { width: 640, height: 480, frameRate: 24 } as const;

/** Voice: Opus at up to 32 kbit/s, with loss recovery (FEC) and near-silence when nobody talks (DTX). */
export const AUDIO_MAX_BITRATE = 32_000;

export const PROFILES: Record<CallLevel, SendProfile> = {
  good: { video: true, maxBitrate: 650_000, maxFramerate: 24, scaleResolutionDownBy: 1 },
  fair: { video: true, maxBitrate: 300_000, maxFramerate: 15, scaleResolutionDownBy: 1.5 },
  poor: { video: true, maxBitrate: 120_000, maxFramerate: 10, scaleResolutionDownBy: 2 },
  audio: { video: false, maxBitrate: 0, maxFramerate: 0, scaleResolutionDownBy: 1 },
};

const ORDER: CallLevel[] = ["audio", "poor", "fair", "good"];
const rank = (l: CallLevel) => ORDER.indexOf(l);

/** One reading of the connection (from getStats). Unknown values are null. */
export interface LinkSample {
  /** The browser's estimate of what we can send, bits per second. */
  availableOutgoingBitrate: number | null;
  /** seconds */
  roundTripTime: number | null;
  /** 0–1, what the other side reports losing of what we send. */
  fractionLost: number | null;
}

/** The level this one reading supports (before smoothing). */
export function levelFor(s: LinkSample): CallLevel {
  const bw = s.availableOutgoingBitrate;
  const loss = s.fractionLost ?? 0;
  const rtt = s.roundTripTime ?? 0;
  if ((bw != null && bw < 90_000) || loss > 0.2 || rtt > 1.5) return "audio";
  if ((bw != null && bw < 260_000) || loss > 0.1 || rtt > 0.8) return "poor";
  if ((bw != null && bw < 650_000) || loss > 0.04 || rtt > 0.4) return "fair";
  return "good";
}

/**
 * Smooths the readings: drops a level after 2 bad readings in a row (about
 * 4 s), climbs one level only after 5 good ones (about 10 s), so video
 * doesn't flap on a shaky line. Data saver never goes above `poor`.
 */
export class QualityGovernor {
  level: CallLevel = "good";
  private down = 0;
  private up = 0;

  constructor(private dataSaver = false) {
    if (dataSaver) this.level = "poor";
  }

  setDataSaver(on: boolean) {
    this.dataSaver = on;
    if (on && rank(this.level) > rank("poor")) this.level = "poor";
  }

  private get ceiling(): CallLevel {
    return this.dataSaver ? "poor" : "good";
  }

  /** Feed one reading; returns the level to send at now. */
  push(s: LinkSample): CallLevel {
    const seen = ORDER[Math.min(rank(levelFor(s)), rank(this.ceiling))];
    if (rank(seen) < rank(this.level)) {
      this.up = 0;
      if (++this.down >= 2) {
        this.level = seen;
        this.down = 0;
      }
    } else if (rank(seen) > rank(this.level)) {
      this.down = 0;
      if (++this.up >= 5) {
        this.level = ORDER[rank(this.level) + 1];
        this.up = 0;
      }
    } else {
      this.down = 0;
      this.up = 0;
    }
    return this.level;
  }
}

/** Reads a LinkSample out of an RTCStatsReport (or any list of stats records). */
export function sampleFrom(stats: Iterable<Record<string, unknown>>): LinkSample {
  let bw: number | null = null;
  let rtt: number | null = null;
  let lost: number | null = null;
  for (const r of stats) {
    if (r.type === "candidate-pair" && (r.nominated === true || r.selected === true) && r.state === "succeeded") {
      if (typeof r.availableOutgoingBitrate === "number") bw = r.availableOutgoingBitrate;
      if (typeof r.currentRoundTripTime === "number") rtt = r.currentRoundTripTime;
    }
    if (r.type === "remote-inbound-rtp" && typeof r.fractionLost === "number") lost = Math.max(lost ?? 0, r.fractionLost);
  }
  return { availableOutgoingBitrate: bw, roundTripTime: rtt, fractionLost: lost };
}

/**
 * Opus tuned for weak lines: in-band FEC (rebuilds lost packets), DTX
 * (almost nothing sent while you're quiet), mono, capped bitrate.
 */
export function tuneOpus(sdp: string): string {
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!pt) return sdp;
  const want = { useinbandfec: "1", usedtx: "1", stereo: "0", maxaveragebitrate: String(AUDIO_MAX_BITRATE) };
  const line = new RegExp(`^a=fmtp:${pt} (.*)$`, "m");
  const m = line.exec(sdp);
  if (!m) return sdp.replace(new RegExp(`^(a=rtpmap:${pt} opus/48000[^\\r\\n]*)`, "m"), `$1\r\na=fmtp:${pt} ${Object.entries(want).map(([k, v]) => `${k}=${v}`).join(";")}`);
  const params = new Map(m[1].split(";").filter(Boolean).map((kv) => kv.split("=") as [string, string]));
  for (const [k, v] of Object.entries(want)) params.set(k, v);
  return sdp.replace(line, `a=fmtp:${pt} ${[...params].map(([k, v]) => `${k}=${v}`).join(";")}`);
}

/** Data saver on by default when the browser says data is precious (Save-Data, 2G/3G). */
export function browserWantsDataSaver(): boolean {
  if (typeof navigator === "undefined") return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return c?.saveData === true || c?.effectiveType === "2g" || c?.effectiveType === "slow-2g" || c?.effectiveType === "3g";
}
