import { AnalyzeReport, decideFace, FaceReport, FaceServiceVerificationProvider, ImageReport } from './face.provider';
import { failedStep, LivenessStep, MIN_TILT, MIN_TURN, newChallengeSteps } from './liveness';

const T = { approve: 0.4, review: 0.3 };
const face = (o: Partial<FaceReport> = {}): FaceReport => ({ score: 0.95, box: [0, 0, 200, 200], yaw: 0.02, roll: 1, brightness: 120, sharpness: 150, size: 0.35, ...o });
const img = (o: Partial<FaceReport> = {}, faces = 1): ImageReport => ({ faces, face: faces ? face(o) : null });

/** A good pose-challenge answer: front, then the moves done clearly. */
function report(steps: LivenessStep[], o: { toRef?: number[]; frames?: ImageReport[]; toFirst?: number[]; reference?: ImageReport | null } = {}): AnalyzeReport {
  const moved: Record<LivenessStep, Partial<FaceReport>> = { turnLeft: { yaw: 0.3 }, turnRight: { yaw: -0.3 }, tiltLeft: { roll: 20 }, tiltRight: { roll: -18 } };
  const frames = o.frames ?? [img(), ...steps.map((s) => img(moved[s]))];
  return {
    reference: o.reference === undefined ? img() : o.reference,
    frames,
    similarity: { toReference: o.toRef ?? frames.map(() => 0.62), toFirst: o.toFirst ?? frames.map((_, i) => (i ? 0.7 : 1)) },
  };
}

describe('pose challenge', () => {
  it('always asks for one turn and one other move, never the same twice', () => {
    for (let seed = 0; seed < 200; seed++) {
      let n = seed;
      const steps = newChallengeSteps((max) => (n = (n * 7 + 3) % 97) % max);
      expect(steps).toHaveLength(2);
      expect(new Set(steps).size).toBe(2);
      expect(steps.some((s) => s.startsWith('turn'))).toBe(true);
    }
  });

  it('checks each move against the front frame', () => {
    const front = { yaw: 0.05, roll: 3 };
    expect(failedStep(front, [{ yaw: 0.05 + MIN_TURN + 0.01, roll: 3 }, { yaw: 0.05, roll: 3 - MIN_TILT - 1 }], ['turnLeft', 'tiltRight'])).toBe(-1);
    // Too small a turn, or the wrong way round for one move only.
    expect(failedStep(front, [{ yaw: 0.12, roll: 3 }], ['turnLeft'])).toBe(0);
    expect(failedStep(front, [{ yaw: 0.4, roll: 3 }, { yaw: 0.05, roll: 20 }], ['turnLeft', 'tiltRight'])).toBe(1);
  });

  it('accepts a mirrored camera, where every move comes out the other way round', () => {
    const front = { yaw: 0, roll: 0 };
    expect(failedStep(front, [{ yaw: -0.3, roll: 0 }, { yaw: 0, roll: 18 }], ['turnLeft', 'tiltRight'])).toBe(-1);
  });

  it('a photo held still, or tilted in front of the camera, does not pass a turn', () => {
    const front = { yaw: 0.02, roll: 0 };
    expect(failedStep(front, [{ yaw: 0.04, roll: 1 }, { yaw: 0.03, roll: 25 }], ['turnRight', 'tiltLeft'])).toBe(0);
  });
});

describe('face decision', () => {
  const steps: LivenessStep[] = ['turnLeft', 'tiltRight'];

  it('approves a clear match, reviews a close one, rejects a different person', () => {
    expect(decideFace(report(steps), steps, T)).toEqual({ decision: 'approved', similarity: 62 });
    expect(decideFace(report(steps, { toRef: [0.33, 0.35, 0.31] }), steps, T)).toMatchObject({ decision: 'review', similarity: 35 });
    expect(decideFace(report(steps, { toRef: [0.1, 0.12, 0.08] }), steps, T)).toMatchObject({ decision: 'rejected', reason: expect.stringMatching(/profile photo/) });
  });

  it('needs a profile photo with a face', () => {
    expect(decideFace(report(steps, { reference: img({}, 0) }), steps, T)).toMatchObject({ decision: 'rejected', reason: expect.stringMatching(/profile photo has to show your face/) });
  });

  it('needs one clear, front-facing face first', () => {
    const with0 = (f: ImageReport) => report(steps, { frames: [f, img({ yaw: 0.3 }), img({ roll: -18 })] });
    expect(decideFace(with0(img({}, 0)), steps, T).reason).toMatch(/couldn't see your face/);
    expect(decideFace(with0(img({}, 2)), steps, T).reason).toMatch(/Only you/);
    expect(decideFace(with0(img({ brightness: 30 })), steps, T).reason).toMatch(/too dark/);
    expect(decideFace(with0(img({ sharpness: 12 })), steps, T).reason).toMatch(/blurry/);
    expect(decideFace(with0(img({ size: 0.08 })), steps, T).reason).toMatch(/Move closer/);
    expect(decideFace(with0(img({ yaw: 0.35 })), steps, T).reason).toMatch(/Look straight/);
  });

  it('keeps the same person through the moves and names the missed move', () => {
    expect(decideFace(report(steps, { toFirst: [1, 0.7, 0.1] }), steps, T).reason).toMatch(/same face/);
    expect(decideFace(report(steps, { frames: [img(), img({}, 0), img({ roll: -18 })] }), steps, T).reason).toMatch(/lost your face/);
    expect(decideFace(report(steps, { frames: [img(), img({ yaw: 0.04 }), img({ roll: -18 })] }), steps, T).reason).toBe(
      "We couldn't see you turn your head to the left. Follow the moves on screen and try again.",
    );
  });
});

describe('face service provider', () => {
  const ok = (body: unknown, status = 200) => jest.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const input = { userId: 'u', selfie: Buffer.from('a'), profilePhoto: Buffer.from('p'), frames: [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')], steps: ['turnLeft', 'tiltRight'] as LivenessStep[] };

  it('sends the profile photo and the frames, and decides from the answer', async () => {
    const http = ok(report(input.steps));
    const p = new FaceServiceVerificationProvider('http://face:8000/', T, http as never);
    expect(await p.verify(input)).toMatchObject({ decision: 'approved' });
    const [url, init] = http.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://face:8000/analyze');
    const form = init.body as FormData;
    expect(form.getAll('frames')).toHaveLength(3);
    expect(form.get('reference')).toBeInstanceOf(Blob);
  });

  it('turns unreadable photos into a reason, and service failures into errors (→ staff review)', async () => {
    expect(await new FaceServiceVerificationProvider('http://f', T, ok({}, 400) as never).verify(input)).toMatchObject({ decision: 'rejected' });
    await expect(new FaceServiceVerificationProvider('http://f', T, ok({}, 503) as never).verify(input)).rejects.toThrow(/503/);
  });

  it('asks old app versions (one selfie, no moves) to update, and needs a profile photo', async () => {
    const p = new FaceServiceVerificationProvider('http://f', T, ok({}) as never);
    expect(await p.verify({ ...input, frames: undefined, steps: undefined })).toMatchObject({ reason: expect.stringMatching(/Update Vibe/) });
    expect(await p.verify({ ...input, profilePhoto: null })).toMatchObject({ reason: expect.stringMatching(/profile photo/) });
  });
});
