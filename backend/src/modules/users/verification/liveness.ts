import { randomInt } from 'node:crypto';

/**
 * The pose challenge: the app asks for a front-facing photo, then two random
 * moves, and sends one frame per move. A printed photo or a picture on another
 * screen can be tilted, but it can't turn its head: a turn moves the nose
 * against the eyes in 3D, so every challenge has at least one turn.
 */
export const LIVENESS_STEPS = ['turnLeft', 'turnRight', 'tiltLeft', 'tiltRight'] as const;
export type LivenessStep = (typeof LIVENESS_STEPS)[number];

/** What the screens say for each move (also used in error messages). */
export const STEP_TEXT: Record<LivenessStep, string> = {
  turnLeft: 'turn your head to the left',
  turnRight: 'turn your head to the right',
  tiltLeft: 'tilt your head toward your left shoulder',
  tiltRight: 'tilt your head toward your right shoulder',
};

/** One turn plus one other move, in random order. */
export function newChallengeSteps(rand: (n: number) => number = randomInt): LivenessStep[] {
  const turn: LivenessStep = rand(2) === 0 ? 'turnLeft' : 'turnRight';
  const others = LIVENESS_STEPS.filter((s) => s !== turn);
  const other = others[rand(others.length)];
  return rand(2) === 0 ? [turn, other] : [other, turn];
}

/** Head pose of one frame as the face service measures it (camera image, not mirrored). */
export interface Pose {
  /** Nose offset along the eye line in eye distances; > 0 = toward the image's right. */
  yaw: number;
  /** Eye-line angle in degrees; > 0 = the image-right eye is lower. */
  roll: number;
}

/**
 * Minimum change from the front-facing frame. Measured on LFW: landmark noise is
 * about 0.07 (yaw) and 6° (roll) at the 90th percentile, so these need a clear move
 * (roughly a 17° turn, a 12° tilt) while a still face can't pass by jitter.
 */
export const MIN_TURN = 0.15;
export const MIN_TILT = 12;

/**
 * In the raw camera image (what the face service sees) a person turning to *their*
 * left moves their nose toward the image's right (+yaw), and tilting toward their
 * left shoulder lowers their left eye, which is on the image's right (+roll).
 */
function expected(step: LivenessStep): { axis: 'yaw' | 'roll'; sign: 1 | -1 } {
  switch (step) {
    case 'turnLeft':
      return { axis: 'yaw', sign: 1 };
    case 'turnRight':
      return { axis: 'yaw', sign: -1 };
    case 'tiltLeft':
      return { axis: 'roll', sign: 1 };
    case 'tiltRight':
      return { axis: 'roll', sign: -1 };
  }
}

/**
 * Index of the first move that wasn't done, or -1 when all were. Some cameras hand
 * over mirrored frames, which swaps left and right for every move at once, so the
 * moves pass if they all match either the camera's view or its mirror image.
 */
export function failedStep(front: Pose, moves: Pose[], steps: LivenessStep[]): number {
  const firstMiss = (mirror: 1 | -1) =>
    steps.findIndex((step, i) => {
      const { axis, sign } = expected(step);
      const delta = moves[i][axis] - front[axis];
      return delta * sign * mirror < (axis === 'yaw' ? MIN_TURN : MIN_TILT);
    });
  const asSeen = firstMiss(1);
  if (asSeen === -1) return -1;
  const mirrored = firstMiss(-1);
  if (mirrored === -1) return -1;
  return Math.max(asSeen, mirrored); // report the one that got further
}
