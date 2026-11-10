/**
 * Calls on weak and expensive connections, the simple way (like WhatsApp):
 * video never pauses. WebRTC's own congestion control already lowers the
 * resolution and frame rate when the line gets worse and raises them again
 * when it recovers; we only set a ceiling (lower with Data saver) and let
 * voice go first. No stats polling, no levels.
 *
 * The same numbers are in the app (lib/services/calls/call_quality.dart).
 */

/** Camera capture (before the encoder scales it down): 640×480 is plenty for a phone-sized tile. */
export const CAPTURE = { width: 640, height: 480, frameRate: 24 } as const;

/** Voice: Opus at up to 32 kbit/s, with loss recovery (FEC) and near-silence when nobody talks (DTX). */
export const AUDIO_MAX_BITRATE = 32_000;

/** The most video we send, bits per second. WebRTC goes lower by itself whenever the line needs it. */
export const VIDEO_MAX_BITRATE = 700_000;

/** With Data saver on: about a third of the data, still moving video. */
export const VIDEO_MAX_BITRATE_SAVER = 250_000;

export const videoCeiling = (dataSaver: boolean) => (dataSaver ? VIDEO_MAX_BITRATE_SAVER : VIDEO_MAX_BITRATE);

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
