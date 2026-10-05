import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The match store talks to the API and the socket: stub both.
vi.mock("@/stores/services", () => ({
  api: { hasSession: false, get: vi.fn(async () => ({})), post: vi.fn(async () => ({})) },
  realtime: { on: vi.fn(), request: vi.fn(async () => ({})) },
}));

type FakeTrack = { kind: string; enabled: boolean; stopped: boolean; stop: () => void };

let opened: { tracks: FakeTrack[] }[] = [];

function fakeStream() {
  const tracks: FakeTrack[] = ["audio", "video"].map((kind): FakeTrack => ({
    kind,
    enabled: true,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  }));
  const s = {
    tracks,
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
  };
  opened.push(s);
  return s;
}

const getUserMedia = vi.fn(async () => {
  await new Promise((r) => setTimeout(r, 50)); // the camera takes a moment
  return fakeStream() as unknown as MediaStream;
});

vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

const { useMatch, PREVIEW_IDLE_MS, HIDDEN_GRACE_MS } = await import("@/stores/match");

const live = () => opened.filter((s) => s.tracks.some((t) => !t.stopped)).length;

describe("camera battery rules", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    opened = [];
    getUserMedia.mockClear();
    const m = useMatch.getState();
    m.setPageHidden(false);
    m.setLobbyVisible(false);
    m.reset();
  });

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it("opening /match does not open the camera", async () => {
    useMatch.getState().setLobbyVisible(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(useMatch.getState().cameraActive).toBe(false);
  });

  it("tap to preview opens it; leaving the page stops every track; coming back resumes", async () => {
    const m = useMatch.getState();
    m.setLobbyVisible(true);
    m.startPreview();
    await vi.advanceTimersByTimeAsync(100);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(useMatch.getState().localStream).not.toBeNull();

    m.setLobbyVisible(false); // went to Chats / Store / Me
    expect(useMatch.getState().localStream).toBeNull();
    expect(live()).toBe(0);

    m.setLobbyVisible(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(live()).toBe(1);
  });

  it("an open cancelled mid-flight is stopped when it arrives", async () => {
    const m = useMatch.getState();
    m.setLobbyVisible(true);
    m.startPreview();
    await vi.advanceTimersByTimeAsync(10);
    m.setLobbyVisible(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(useMatch.getState().localStream).toBeNull();
    expect(useMatch.getState().cameraActive).toBe(false);
    expect(live()).toBe(0);
  });

  it("the preview times out without a touch", async () => {
    const m = useMatch.getState();
    m.setLobbyVisible(true);
    m.startPreview();
    await vi.advanceTimersByTimeAsync(PREVIEW_IDLE_MS - 10_000);
    m.touchPreview();
    await vi.advanceTimersByTimeAsync(PREVIEW_IDLE_MS - 10_000);
    expect(live()).toBe(1);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(useMatch.getState().previewOn).toBe(false);
    expect(live()).toBe(0);
  });

  it("a hidden tab closes the camera and it stays off when you come back", async () => {
    const m = useMatch.getState();
    m.setLobbyVisible(true);
    m.startPreview();
    await vi.advanceTimersByTimeAsync(100);
    m.setPageHidden(true);
    expect(live()).toBe(0);
    m.setPageHidden(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("searching keeps the camera off-page; a hidden tab leaves the queue", async () => {
    const m = useMatch.getState();
    await m.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(useMatch.getState().status).toBe("searching");
    expect(live()).toBe(1);
    m.setPageHidden(true);
    expect(useMatch.getState().status).toBe("idle");
    expect(live()).toBe(0);
  });

  it("a call survives a short hidden spell, then ends", async () => {
    useMatch.setState({ status: "connected" }); // match:found
    await vi.advanceTimersByTimeAsync(100);
    expect(live()).toBe(1);
    const stop = vi.spyOn(useMatch.getState(), "stop");
    useMatch.getState().setPageHidden(true);
    expect(opened[0].tracks.find((t) => t.kind === "video")!.enabled).toBe(false); // video paused
    await vi.advanceTimersByTimeAsync(HIDDEN_GRACE_MS - 1000);
    expect(stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(stop).toHaveBeenCalled();
    // The server's match:ended moves us to "ended": the camera closes.
    useMatch.setState({ status: "ended" });
    expect(live()).toBe(0);
  });
});
