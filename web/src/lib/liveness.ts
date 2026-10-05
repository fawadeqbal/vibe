/**
 * The selfie check's pose challenge (backend: users/verification/liveness.ts).
 * The server picks the moves; the client shows them and sends one frame each,
 * after a front-facing one.
 */
export type LivenessStep = "turnLeft" | "turnRight" | "tiltLeft" | "tiltRight";

export interface LivenessChallenge {
  id: string;
  steps: LivenessStep[];
}

/** What one capture asks for: the front photo is "front", then the server's moves. */
export type CaptureStep = "front" | LivenessStep;

/** Instruction and icon per step. The preview is mirrored, so arrows point the way the face moves on screen. */
export const CAPTURE_STEP: Record<CaptureStep, { title: string; icon: string }> = {
  front: { title: "Look straight at the camera", icon: "face" },
  turnLeft: { title: "Turn your head to the left", icon: "arrow_back" },
  turnRight: { title: "Turn your head to the right", icon: "arrow_forward" },
  tiltLeft: { title: "Tilt your head to your left shoulder", icon: "rotate_left" },
  tiltRight: { title: "Tilt your head to your right shoulder", icon: "rotate_right" },
};

/** Seconds of countdown before each frame is taken. */
export const CAPTURE_SECONDS = 3;

const KNOWN = new Set<string>(["turnLeft", "turnRight", "tiltLeft", "tiltRight"]);

export function parseChallenge(m: Record<string, unknown>): LivenessChallenge {
  const steps = Array.isArray(m.steps) ? m.steps.filter((s): s is LivenessStep => typeof s === "string" && KNOWN.has(s)) : [];
  if (typeof m.id !== "string" || !steps.length) throw new Error("Unexpected selfie check from the server");
  return { id: m.id, steps };
}
