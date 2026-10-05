import type { LivenessStep } from './liveness';

/** What a verification provider decided about one selfie. */
export interface VerificationDecision {
  decision: 'approved' | 'rejected' | 'review';
  /** Face similarity 0–100, when the provider measures it. */
  similarity?: number;
  reason?: string;
}

export interface VerificationInput {
  userId: string;
  /** The front-facing photo (the first frame of a pose challenge). */
  selfie: Buffer;
  /** The current profile photo, when we can read it (our own storage). */
  profilePhoto: Buffer | null;
  /** Pose challenge: [front, one frame per step], and the steps that were asked for. */
  frames?: Buffer[];
  steps?: LivenessStep[];
}

/** Selfie verification (face match against the profile photo). Choose with VERIFICATION_PROVIDER. */
export abstract class VerificationProvider {
  abstract readonly name: string;
  /** Needs a pose challenge (POST /me/verification/challenge) rather than a single selfie. */
  readonly liveness: boolean = false;
  abstract verify(input: VerificationInput): Promise<VerificationDecision>;
}

/** Dev: approves anyone who has a profile photo. */
export class DevVerificationProvider extends VerificationProvider {
  readonly name = 'dev';
  async verify(input: VerificationInput & { hasPhoto?: boolean }): Promise<VerificationDecision> {
    return input.hasPhoto || input.profilePhoto ? { decision: 'approved' } : { decision: 'rejected', reason: 'Add a profile photo first' };
  }
}

/** Every selfie waits for a person in the admin panel (Users → Verifications). */
export class ManualVerificationProvider extends VerificationProvider {
  readonly name = 'manual';
  async verify(): Promise<VerificationDecision> {
    return { decision: 'review' };
  }
}
