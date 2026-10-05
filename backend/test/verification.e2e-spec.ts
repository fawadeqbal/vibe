import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { FaceServiceVerificationProvider } from '../src/modules/users/verification/face.provider';
import { VerificationService } from '../src/modules/users/verification/verification.service';
import { createTestApp, resetState, signUp, TestApp, TestUser } from './helpers';

/** A stand-in for the vibe-face container: records each request, answers with `next`. */
class FakeFaceService {
  server!: Server;
  url = '';
  requests: { contentType: string; body: string }[] = [];
  next: { status: number; body?: unknown } = { status: 200 };

  async start() {
    this.server = createServer(async (req: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      this.requests.push({ contentType: req.headers['content-type'] ?? '', body: Buffer.concat(chunks).toString('latin1') });
      res.writeHead(this.next.status, { 'content-type': 'application/json' }).end(JSON.stringify(this.next.body ?? {}));
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
}

/** What vibe-face says when the person did the moves and matches the profile photo. */
function goodReport(steps: string[], match = 0.66) {
  const pose: Record<string, { yaw: number; roll: number }> = { turnLeft: { yaw: 0.32, roll: 0 }, turnRight: { yaw: -0.3, roll: 0 }, tiltLeft: { yaw: 0, roll: 19 }, tiltRight: { yaw: 0, roll: -21 } };
  const face = (p = { yaw: 0.01, roll: 1 }) => ({ faces: 1, face: { score: 0.93, box: [100, 80, 260, 300], brightness: 128, sharpness: 140, size: 0.4, ...p } });
  const frames = [face(), ...steps.map((s) => face(pose[s]))];
  return { reference: face(), frames, similarity: { toReference: frames.map(() => match), toFirst: frames.map((_, i) => (i ? 0.71 : 1)) } };
}

describe('selfie verification with the pose challenge (face provider)', () => {
  let t: TestApp;
  const face = new FakeFaceService();
  let svc: VerificationService;
  let original: unknown;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
    await face.start();
    svc = t.app.get(VerificationService);
    original = svc.provider;
    (svc as { provider: unknown }).provider = new FaceServiceVerificationProvider(face.url, { approve: 0.4, review: 0.3 });
  });
  afterAll(async () => {
    (svc as { provider: unknown }).provider = original;
    face.server.close();
    await t.close();
  });

  /** A user whose profile photo is in our storage (the face service compares against it). */
  const withPhoto = async (): Promise<TestUser> => {
    const u = await signUp(t);
    await t.http.post('/v1/me/avatar').set(u.auth).attach('file', Buffer.from('profile-photo-bytes'), { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(201);
    return u;
  };
  const challenge = async (u: TestUser) => (await t.http.post('/v1/me/verification/challenge').set(u.auth).expect(200)).body as { id: string; steps: string[]; frames: number; expiresAt: string };
  const send = (u: TestUser, id: string | null, n: number) => {
    let r = t.http.post('/v1/me/verification').set(u.auth);
    if (id) r = r.field('challengeId', id);
    for (let i = 0; i < n; i++) r = r.attach('frames', Buffer.from(`frame-${i}`), `frame${i}.jpg`);
    return r;
  };

  it('hands out one turn and one other move, then badges a person who does them', async () => {
    const u = await withPhoto();
    const c = await challenge(u);
    expect(c.steps).toHaveLength(2);
    expect(c.steps.some((s) => s.startsWith('turn'))).toBe(true);
    expect(c.frames).toBe(3);
    expect(new Date(c.expiresAt).getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);

    face.next = { status: 200, body: goodReport(c.steps) };
    face.requests = [];
    const r = await send(u, c.id, 3).expect(200);
    expect(r.body).toMatchObject({ verified: true, verification: { status: 'APPROVED' } });
    // The profile photo and every frame went to the face service, in order.
    const sent = face.requests[0].body;
    expect(sent).toContain('profile-photo-bytes');
    expect(sent.indexOf('frame-0')).toBeLessThan(sent.indexOf('frame-2'));
    const saved = await t.prisma.verificationRequest.findFirstOrThrow({ where: { userId: u.id } });
    expect(saved).toMatchObject({ provider: 'face', status: 'APPROVED', similarity: 66, selfieKey: null });
    // Verified people don't get a new challenge.
    await t.http.post('/v1/me/verification/challenge').set(u.auth).expect(409);
  });

  it('a challenge works once, only for its owner, and only with the right number of photos', async () => {
    const u = await withPhoto();
    const other = await withPhoto();
    const c = await challenge(u);
    expect((await send(other, c.id, 3).expect(400)).body.error.message).toMatch(/timed out/);
    // The failed attempt by someone else used it up: the owner starts again.
    expect((await send(u, c.id, 3).expect(400)).body.error.message).toMatch(/timed out/);

    const c2 = await challenge(u);
    expect((await send(u, c2.id, 2).expect(400)).body.error.message).toMatch(/Send 3 photos/);
    expect((await send(u, null, 3).expect(400)).body.error.message).toMatch(/timed out/);
  });

  it('asks older app versions that send one selfie to update', async () => {
    const u = await withPhoto();
    const r = await t.http.post('/v1/me/verification').set(u.auth).attach('selfie', Buffer.from('one-selfie'), 'selfie.jpg').expect(400);
    expect(r.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: expect.stringMatching(/Update Vibe/) });
  });

  it('turns a missed move into a reason the person can act on', async () => {
    const u = await withPhoto();
    const c = await challenge(u);
    const report = goodReport(c.steps);
    report.frames[1].face = { ...report.frames[1].face, yaw: 0.02, roll: 1 }; // stayed still
    face.next = { status: 200, body: report };
    const r = await send(u, c.id, 3).expect(400);
    expect(r.body.error.message).toMatch(/^We couldn't see you (turn|tilt) your head/);
    expect((await t.http.get('/v1/me/verification').set(u.auth)).body).toMatchObject({ status: 'REJECTED' });
  });

  it('when the face service is down, a person reviews the front photo instead', async () => {
    const u = await withPhoto();
    const c = await challenge(u);
    face.next = { status: 503 };
    const r = await send(u, c.id, 3).expect(200);
    expect(r.body).toMatchObject({ verified: false, verification: { status: 'PENDING', reason: 'Automatic check unavailable' } });
    const req = await t.prisma.verificationRequest.findFirstOrThrow({ where: { userId: u.id } });
    expect((await svc.selfie(req.id)).toString()).toBe('frame-0');
  });
});
