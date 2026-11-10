import { describe, expect, it } from "vitest";

import { tuneOpus, VIDEO_MAX_BITRATE, VIDEO_MAX_BITRATE_SAVER, videoCeiling } from "../call-quality";

describe("call quality", () => {
  it("only a ceiling on video: lower with Data saver, never zero", () => {
    expect(videoCeiling(false)).toBe(VIDEO_MAX_BITRATE);
    expect(videoCeiling(true)).toBe(VIDEO_MAX_BITRATE_SAVER);
    expect(VIDEO_MAX_BITRATE_SAVER).toBeGreaterThan(0);
  });

  it("tunes Opus for loss and silence", () => {
    const sdp = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 63\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\na=rtpmap:63 red/48000/2\r\n";
    const out = tuneOpus(sdp);
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=32000\r\n");
    expect(out).toContain("a=rtpmap:63 red/48000/2");
    expect(tuneOpus("a=rtpmap:109 opus/48000/2\r\nx")).toBe("a=rtpmap:109 opus/48000/2\r\na=fmtp:109 useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=32000\r\nx");
    expect(tuneOpus("no audio")).toBe("no audio");
  });
});
