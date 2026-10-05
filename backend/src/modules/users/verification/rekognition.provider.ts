import { CompareFacesCommand, DetectFacesCommand, RekognitionClient } from '@aws-sdk/client-rekognition';

import { VerificationDecision, VerificationInput, VerificationProvider } from './verification.provider';

/**
 * AWS Rekognition: the selfie must show exactly one clear face, and that
 * face must match the profile photo. Strong matches pass automatically;
 * close calls go to staff review; clear mismatches are rejected.
 */
export class RekognitionVerificationProvider extends VerificationProvider {
  readonly name = 'rekognition';

  constructor(
    private readonly client: Pick<RekognitionClient, 'send'>,
    /** Similarity (0–100) needed to approve automatically. */
    private readonly minSimilarity: number,
  ) {
    super();
  }

  async verify(input: VerificationInput): Promise<VerificationDecision> {
    if (!input.profilePhoto) return { decision: 'rejected', reason: 'Add a profile photo of yourself first' };
    const faces = await this.client.send(new DetectFacesCommand({ Image: { Bytes: input.selfie }, Attributes: ['DEFAULT'] }));
    const found = faces.FaceDetails ?? [];
    if (found.length === 0) return { decision: 'rejected', reason: "We couldn't see a face. Try again in good light." };
    if (found.length > 1) return { decision: 'rejected', reason: 'Only you should be in the selfie.' };
    const q = found[0].Quality;
    if ((q?.Brightness ?? 100) < 20 || (q?.Sharpness ?? 100) < 10) return { decision: 'rejected', reason: 'The selfie is too dark or blurry. Try again.' };

    const cmp = await this.client.send(new CompareFacesCommand({ SourceImage: { Bytes: input.selfie }, TargetImage: { Bytes: input.profilePhoto }, SimilarityThreshold: 50 }));
    const best = Math.max(0, ...(cmp.FaceMatches ?? []).map((m) => m.Similarity ?? 0));
    if (best >= this.minSimilarity) return { decision: 'approved', similarity: best };
    if (best >= 70) return { decision: 'review', similarity: best, reason: 'Close match — a person will check' };
    return { decision: 'rejected', similarity: best, reason: "The selfie doesn't match your profile photo. Use a recent photo of yourself." };
  }
}
