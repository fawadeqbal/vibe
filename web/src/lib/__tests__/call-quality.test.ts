import { describe, expect, it } from "vitest";

import { levelFor, PROFILES, QualityGovernor, sampleFrom, tuneOpus } from "../call-quality";

const good = { availableOutgoingBitrate: 2_000_000, roundTripTime: 0.05, fractionLost: 0 };
const weak = { availableOutgoingBitrate: 200_000, roundTripTime: 0.3, fractionLost: 0.02 };
const awful = { availableOutgoingBitrate: 60_000, roundTripTime: 2, fractionLost: 0.3 };

describe("call quality", () => {
  it("picks a level from bandwidth, loss and round trip", () => {
    expect(levelFor(good)).toBe("good");
    expect(levelFor({ ...good, availableOutgoingBitrate: 400_000 })).toBe("fair");
    expect(levelFor(weak)).toBe("poor");
    expect(levelFor({ ...good, fractionLost: 0.12 })).toBe("poor");
    expect(levelFor(awful)).toBe("audio");
    expect(levelFor({ availableOutgoingBitrate: null, roundTripTime: null, fractionLost: null })).toBe("good");
    expect(PROFILES.audio.video).toBe(false);
    expect(PROFILES.poor.maxBitrate).toBeLessThan(PROFILES.fair.maxBitrate);
  });

  it("drops fast, climbs slowly, one level at a time", () => {
    const g = new QualityGovernor();
    expect(g.push(awful)).toBe("good"); // one bad reading isn't enough
    expect(g.push(awful)).toBe("audio"); // two are
    for (let i = 0; i < 4; i++) expect(g.push(good)).toBe("audio");
    expect(g.push(good)).toBe("poor"); // five good readings: one step up
    for (let i = 0; i < 5; i++) g.push(good);
    expect(g.level).toBe("fair");
    g.push(good);
    g.push(weak); // a blip resets the climb
    for (let i = 0; i < 4; i++) g.push(good);
    expect(g.level).toBe("fair");
  });

  it("data saver never sends more than the poor-line profile", () => {
    const g = new QualityGovernor(true);
    expect(g.level).toBe("poor");
    for (let i = 0; i < 20; i++) g.push(good);
    expect(g.level).toBe("poor");
    const h = new QualityGovernor();
    h.setDataSaver(true);
    expect(h.level).toBe("poor");
  });

  it("reads the selected pair and the loss the other side reports", () => {
    const s = sampleFrom([
      { type: "candidate-pair", nominated: true, state: "succeeded", availableOutgoingBitrate: 300_000, currentRoundTripTime: 0.12 },
      { type: "candidate-pair", nominated: false, state: "waiting", availableOutgoingBitrate: 9 },
      { type: "remote-inbound-rtp", kind: "audio", fractionLost: 0.01 },
      { type: "remote-inbound-rtp", kind: "video", fractionLost: 0.06 },
    ]);
    expect(s).toEqual({ availableOutgoingBitrate: 300_000, roundTripTime: 0.12, fractionLost: 0.06 });
  });

  it("tunes Opus for loss and silence", () => {
    const sdp = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 63\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\na=rtpmap:63 red/48000/2\r\n";
    const out = tuneOpus(sdp);
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=32000\r\n");
    expect(out).toContain("a=rtpmap:63 red/48000/2");
    // No fmtp line yet: one is added under the rtpmap.
    expect(tuneOpus("a=rtpmap:109 opus/48000/2\r\nx")).toBe("a=rtpmap:109 opus/48000/2\r\na=fmtp:109 useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=32000\r\nx");
    expect(tuneOpus("no audio")).toBe("no audio");
  });
});
