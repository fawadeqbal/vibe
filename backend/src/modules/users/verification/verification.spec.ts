import { CompareFacesCommand, DetectFacesCommand } from '@aws-sdk/client-rekognition';

import { RekognitionVerificationProvider } from './rekognition.provider';

const client = (faces: number, similarity?: number, quality = { Brightness: 80, Sharpness: 80 }) => ({
  send: async (cmd: unknown) => {
    if (cmd instanceof DetectFacesCommand) return { FaceDetails: Array.from({ length: faces }, () => ({ Quality: quality })) };
    if (cmd instanceof CompareFacesCommand) return { FaceMatches: similarity === undefined ? [] : [{ Similarity: similarity }] };
    throw new Error('unexpected');
  },
});

describe('Rekognition selfie check', () => {
  const run = (c: ReturnType<typeof client>, photo: Buffer | null = Buffer.from('p')) =>
    new RekognitionVerificationProvider(c as never, 90).verify({ userId: 'u', selfie: Buffer.from('s'), profilePhoto: photo });

  it('approves strong matches, reviews close ones, rejects the rest', async () => {
    expect(await run(client(1, 97))).toMatchObject({ decision: 'approved', similarity: 97 });
    expect(await run(client(1, 80))).toMatchObject({ decision: 'review', similarity: 80 });
    expect(await run(client(1, 40))).toMatchObject({ decision: 'rejected' });
    expect(await run(client(1))).toMatchObject({ decision: 'rejected' });
  });

  it('needs exactly one clear face and a profile photo', async () => {
    expect(await run(client(0, 99))).toMatchObject({ decision: 'rejected', reason: expect.stringMatching(/face/) });
    expect(await run(client(2, 99))).toMatchObject({ decision: 'rejected', reason: expect.stringMatching(/Only you/) });
    expect(await run(client(1, 99, { Brightness: 5, Sharpness: 80 }))).toMatchObject({ decision: 'rejected' });
    expect(await run(client(1, 99), null)).toMatchObject({ decision: 'rejected', reason: expect.stringMatching(/profile photo/) });
  });
});
