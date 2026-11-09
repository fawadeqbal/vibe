import { LegalService } from '../src/modules/legal/legal.service';
import { createTestApp, resetState, signUp, staffLogin, TestApp, TestStaff } from './helpers';

/** Legal pages: seeded on start, public to read, edited in admin, and the Terms version recorded at sign-up. */
describe('legal pages', () => {
  let t: TestApp;
  let owner: TestStaff;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
    await t.prisma.legalDocument.deleteMany();
    await t.app.get(LegalService).seed();
    owner = await staffLogin(t);
  });
  afterAll(() => t.close());

  it('four pages are seeded and public, with safe HTML and a contact', async () => {
    const list = (await t.http.get('/v1/legal').expect(200)).body as { slug: string; version: number }[];
    expect(list.map((d) => d.slug)).toEqual(['terms', 'privacy', 'guidelines', 'child-safety']);
    const terms = (await t.http.get('/v1/legal/terms').expect(200)).body;
    expect(terms).toMatchObject({ slug: 'terms', title: 'Terms of Use', version: 1 });
    expect(terms.html).toContain('<h2 id="who-can-use-vibe">');
    expect(terms.markdown).not.toContain('{{email}}');
    expect(terms.markdown).toMatch(/[\w.+-]+@[\w.-]+/);
    await t.http.get('/v1/legal/nope').expect(404);
    // Seeding again never overwrites.
    expect(await t.app.get(LegalService).seed()).toBe(0);
  });

  it('admin edits a page: new version, safe preview, audit; reset brings the original back', async () => {
    const admin = (await t.http.get('/v1/admin/legal').set(owner.auth).expect(200)).body as { slug: string }[];
    expect(admin).toHaveLength(4);
    const preview = (await t.http.post('/v1/admin/legal/preview').set(owner.auth).send({ markdown: '## Hi\n\n<script>x</script>' }).expect(200)).body;
    expect(preview.html).toBe('<h2 id="hi">Hi</h2>\n<p>&lt;script&gt;x&lt;/script&gt;</p>');

    const saved = (await t.http.put('/v1/admin/legal/guidelines').set(owner.auth).send({ title: 'House rules', summary: 'Be kind.', markdown: '## Be kind\n\nNo nudity, no hate, no scams. Report in two taps.' }).expect(200)).body;
    expect(saved).toMatchObject({ title: 'House rules', version: 2 });
    expect((await t.http.get('/v1/legal/guidelines').expect(200)).body.html).toContain('<h2 id="be-kind">Be kind</h2>');
    const log = (await t.http.get('/v1/admin/audit').query({ action: 'legal.updated' }).set(owner.auth).expect(200)).body;
    expect(JSON.stringify(log)).toContain('guidelines');

    const reset = (await t.http.post('/v1/admin/legal/guidelines/reset').set(owner.auth).expect(200)).body;
    expect(reset).toMatchObject({ title: 'Community Guidelines', version: 3 });
    await t.http.put('/v1/admin/legal/guidelines').set(owner.auth).send({ title: 'x', summary: '', markdown: 'short' }).expect(400);
  });

  it('only staff with Settings can edit', async () => {
    const support = await staffLogin(t, 'support');
    await t.http.put('/v1/admin/legal/terms').set(support.auth).send({ title: 'Terms', summary: '', markdown: '## Terms\n\nAnything goes, long enough text here.' }).expect(403);
    const u = await signUp(t);
    await t.http.put('/v1/admin/legal/terms').set(u.auth).send({}).expect(401);
  });

  it('sign-up records the Terms version agreed to', async () => {
    const v = (await t.http.get('/v1/legal/terms').expect(200)).body.version;
    const u = await signUp(t);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.termsVersion).toBe(v);
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);
  });
});
