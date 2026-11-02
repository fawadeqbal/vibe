import { AppDownloadService } from '../src/modules/site/app-download.service';
import { createTestApp, resetState, staffLogin, TestApp } from './helpers';

const DEFAULT = 'https://github.com/fawadeqbal/vibe/releases/latest/download/vibe.apk';

/** Admin → Configuration → Android app download. */
describe('Android download link', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    // A fake web: .apk links serve a zip ("PK…"), a page serves HTML, a missing file 404s.
    t.app.get(AppDownloadService).fetchImpl = (async (url: string) => {
      if (url.includes('missing')) return new Response('Not found', { status: 404 });
      if (url.endsWith('.apk')) return new Response(new Uint8Array([0x50, 0x4b, 3, 4]), { status: 206 });
      return new Response('<html>', { status: 200 });
    }) as never;
  });
  beforeEach(() => resetState(t));
  afterAll(() => t.close());

  it('staff change where "Download for Android" goes; a link that is not an APK is refused', async () => {
    const owner = await staffLogin(t, 'owner');
    const dl = () => t.http.get('/v1/site/download/android').set('User-Agent', 'Mozilla/5.0 (Linux; Android 14) Mobile').expect(302);
    expect((await t.http.get('/v1/admin/config/download').set(owner.auth).expect(200)).body).toMatchObject({ source: 'default', androidUrl: DEFAULT });
    expect((await dl()).headers.location).toBe(DEFAULT);

    for (const [bad, code] of [
      ['http://example.com/vibe.apk', 'VALIDATION_FAILED'],
      ['https://example.com/releases/page', 'DOWNLOAD_LINK_BROKEN'],
      ['https://example.com/missing/vibe.apk', 'DOWNLOAD_LINK_BROKEN'],
    ]) {
      const r = await t.http.put('/v1/admin/config/download').set(owner.auth).send({ androidUrl: bad }).expect(400);
      expect(r.body.error.code).toBe(code);
    }

    const url = 'https://github.com/fawadeqbal/vibe/releases/download/app-v0.1.6/vibe-0.1.6.apk';
    expect((await t.http.put('/v1/admin/config/download').set(owner.auth).send({ androidUrl: url }).expect(200)).body).toMatchObject({ source: 'admin', androidUrl: url, updatedBy: owner.email });
    expect((await dl()).headers.location).toBe(url);

    // Back to the latest release.
    expect((await t.http.put('/v1/admin/config/download').set(owner.auth).send({ androidUrl: '' }).expect(200)).body).toMatchObject({ source: 'default', androidUrl: DEFAULT });
    expect((await dl()).headers.location).toBe(DEFAULT);

    const viewer = await staffLogin(t, 'viewer');
    await t.http.put('/v1/admin/config/download').set(viewer.auth).send({ androidUrl: url }).expect(403);
  });
});
