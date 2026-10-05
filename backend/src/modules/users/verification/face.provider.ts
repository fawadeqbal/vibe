import { failedStep, LivenessStep, Pose, STEP_TEXT } from './liveness';
import { VerificationDecision, VerificationInput, VerificationProvider } from './verification.provider';

/** One face as vibe-face reports it (see face/app/analysis.py). */
export interface FaceReport extends Pose {
  score: number;
  box: number[];
  brightness: number;
  sharpness: number;
  size: number;
}

export interface ImageReport {
  /** People in the picture (tiny background faces aren't counted). */
  faces: number;
  face: FaceReport | null;
}

/** POST /analyze answer: the profile photo, the frames (front first), and cosine similarities. */
export interface AnalyzeReport {
  reference: ImageReport | null;
  frames: ImageReport[];
  similarity: { toReference: (number | null)[] | null; toFirst: (number | null)[] };
}

export interface FaceThresholds {
  /** Cosine similarity to the profile photo for an automatic badge (SFace: same person ≥ 0.4 in 98% of LFW pairs, other people never). */
  approve: number;
  /** At or above this (and below approve) a person reviews it. */
  review: number;
}

// Measured on LFW (face/README.md): sharp faces ≥ 76 (p10), Gaussian-blurred ≤ 32 (p90);
// normal light ≥ 94 brightness (p10), quarter light ≤ 38 (p90).
const MIN_SHARPNESS = 30;
const MIN_BRIGHTNESS = 50;
/** Face width / image width: too far from the camera below this. */
const MIN_SIZE = 0.12;
/** The first frame must look at the camera. */
const MAX_FRONT_YAW = 0.2;
const MAX_FRONT_ROLL = 15;
/** Every frame must be the same person as the first (turned heads score lower, so this is looser than review). */
const MIN_SAME_PERSON = 0.25;

const reject = (reason: string, similarity?: number): VerificationDecision => ({ decision: 'rejected', reason, ...(similarity === undefined ? {} : { similarity }) });
const pct = (cos: number) => Math.round(Math.max(0, cos) * 1000) / 10;

/**
 * The policy: one clear, front-facing face → every move done by that same face →
 * the face matches the profile photo. Pure, so it is unit-tested with plain numbers.
 */
export function decideFace(r: AnalyzeReport, steps: LivenessStep[], t: FaceThresholds): VerificationDecision {
  if (!r.reference || r.reference.faces === 0 || !r.reference.face) return reject('Your profile photo has to show your face. Change it, then verify again.');
  const [front, ...moves] = r.frames;
  if (!front || moves.length !== steps.length) return reject('Something went wrong with the photos. Try again.');

  if (front.faces === 0 || !front.face) return reject("We couldn't see your face. Try again in good light.");
  if (front.faces > 1) return reject('Only you should be in the picture.');
  const f = front.face;
  if (f.brightness < MIN_BRIGHTNESS) return reject("It's too dark. Face a window or a lamp and try again.");
  if (f.sharpness < MIN_SHARPNESS) return reject('The photo is blurry. Hold still and try again.');
  if (f.size < MIN_SIZE) return reject('Move closer so your face fills the oval.');
  if (Math.abs(f.yaw) > MAX_FRONT_YAW || Math.abs(f.roll) > MAX_FRONT_ROLL) return reject('Look straight at the camera for the first photo.');

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.faces === 0 || !m.face) return reject('We lost your face during the moves. Keep it inside the oval.');
    if (m.faces > 1) return reject('Only you should be in the picture.');
    const same = r.similarity.toFirst[i + 1];
    if (same == null || same < MIN_SAME_PERSON) return reject('Keep the same face in view the whole time.');
  }
  const missed = failedStep(f, moves.map((m) => m.face!), steps);
  if (missed !== -1) return reject(`We couldn't see you ${STEP_TEXT[steps[missed]]}. Follow the moves on screen and try again.`);

  // The best match over all frames: a turned frame can match a turned profile photo better.
  const scores = (r.similarity.toReference ?? []).filter((s): s is number => s != null);
  const best = scores.length ? Math.max(...scores) : 0;
  if (best >= t.approve) return { decision: 'approved', similarity: pct(best) };
  if (best >= t.review) return { decision: 'review', similarity: pct(best), reason: 'Close match — a person will check' };
  return reject("This doesn't look like your profile photo. Use a recent photo of yourself.", pct(best));
}

/** Our own face service (vibe-face container): face match + pose-challenge liveness. */
export class FaceServiceVerificationProvider extends VerificationProvider {
  readonly name = 'face';
  override readonly liveness = true;

  constructor(
    private readonly baseUrl: string,
    private readonly thresholds: FaceThresholds,
    private readonly http: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {
    super();
  }

  async verify(input: VerificationInput): Promise<VerificationDecision> {
    if (!input.profilePhoto) return reject('Add a profile photo of yourself first');
    const frames = input.frames ?? [];
    const steps = input.steps ?? [];
    if (!frames.length || frames.length !== steps.length + 1) return reject('Update Vibe to the latest version to verify.');
    const form = new FormData();
    form.append('reference', new Blob([new Uint8Array(input.profilePhoto)], { type: 'image/jpeg' }), 'reference.jpg');
    frames.forEach((b, i) => form.append('frames', new Blob([new Uint8Array(b)], { type: 'image/jpeg' }), `frame${i}.jpg`));
    const res = await this.http(`${this.baseUrl.replace(/\/$/, '')}/analyze`, { method: 'POST', body: form, signal: AbortSignal.timeout(this.timeoutMs) });
    // A frame it can't read is the client's problem; anything else is ours (→ staff review).
    if (res.status === 400 || res.status === 413) return reject('One of the photos could not be read. Try again.');
    if (!res.ok) throw new Error(`face service answered ${res.status}`);
    return decideFace((await res.json()) as AnalyzeReport, steps, this.thresholds);
  }
}
