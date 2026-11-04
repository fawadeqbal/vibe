import { createTestApp, resetState, signUp, TestApp, TestUser } from './helpers';

/** Contact details in friend chats: hidden for new friends, recorded for moderators. */
describe('chat safety in friend chats', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(t);
    await t.prisma.contactFlag.deleteMany();
  });
  afterAll(async () => {
    await t.close();
  });

  const friends = async (daysAgo = 0) => {
    const a = await signUp(t, { name: 'Asad' });
    const b = await signUp(t, { name: 'Bina' });
    const [low, high] = [a.id, b.id].sort();
    const since = new Date(Date.now() - daysAgo * 86_400_000);
    await t.prisma.friendship.create({ data: { userLowId: low, userHighId: high, requesterId: a.id, status: 'ACCEPTED', createdAt: since, acceptedAt: since } });
    return { a, b };
  };
  const say = async (from: TestUser, to: TestUser, text: string) => (await t.http.post(`/v1/friends/${to.id}/messages`).set(from.auth).send({ text }).expect(201)).body;
  const thread = async (u: TestUser, other: TestUser) =>
    ((await t.http.get(`/v1/friends/${other.id}/messages`).set(u.auth).expect(200)).body.items as { text: string; meta: { hidden?: boolean } | null; fromMe: boolean }[]).filter((m) => m.text);

  it('new friends: numbers, handles and e-mails become **** for both, with a note for the sender', async () => {
    const { a, b } = await friends(1);
    const sent = await say(a, b, 'whatsapp me 0300-123-4567 or ali@gmail.com 🙂');
    expect(sent).toMatchObject({ text: 'whatsapp me **** or **** 🙂', meta: { hidden: true } });
    await say(a, b, 'see you at 7:30, ticket was 500');
    const theirs = await thread(b, a);
    expect(theirs.map((m) => m.text).sort()).toEqual(['see you at 7:30, ticket was 500', 'whatsapp me **** or **** 🙂']);
    expect(theirs.find((m) => m.text.startsWith('see you'))?.meta).toBeNull();
    const flags = await t.prisma.contactFlag.findMany({ where: { userId: a.id } });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ place: 'chat', original: 'whatsapp me 0300-123-4567 or ali@gmail.com 🙂', sent: 'whatsapp me **** or **** 🙂' });
  });

  it('a number sent a few digits at a time is caught', async () => {
    const { a, b } = await friends(1);
    expect((await say(a, b, '0300')).text).toBe('0300');
    expect((await say(a, b, '123')).text).toBe('****');
    expect((await say(a, b, 'hello')).text).toBe('hello');
  });

  it('friends for more than a week can share contact details', async () => {
    const { a, b } = await friends(8);
    expect(await say(a, b, 'my number 03001234567')).toMatchObject({ text: 'my number 03001234567', meta: null });
    expect(await t.prisma.contactFlag.count()).toBe(0);
  });

  it('pushes the hidden text, never the original', async () => {
    const { a, b } = await friends(0);
    await say(a, b, 'insta: ali.khan22');
    const stored = await t.prisma.message.findFirstOrThrow({ where: { senderId: a.id } });
    expect(stored.text).toBe('insta: ****');
    expect(JSON.stringify(stored)).not.toContain('ali.khan22');
  });
});
