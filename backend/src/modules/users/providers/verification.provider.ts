import { Injectable } from '@nestjs/common';

export interface VerificationResult {
  approved: boolean;
  reason?: string;
}

/**
 * Selfie verification (liveness + face match against the profile photo).
 * Swap the dev provider for a vendor (e.g. AWS Rekognition, Persona, Veriff).
 */
export abstract class VerificationProvider {
  abstract verify(userId: string, selfie: Buffer | null, profilePhotoUrl: string): Promise<VerificationResult>;
}

/** Dev: approves anyone who has a profile photo. */
@Injectable()
export class DevVerificationProvider extends VerificationProvider {
  async verify(_userId: string, _selfie: Buffer | null, profilePhotoUrl: string): Promise<VerificationResult> {
    return profilePhotoUrl ? { approved: true } : { approved: false, reason: 'Add a profile photo first' };
  }
}
