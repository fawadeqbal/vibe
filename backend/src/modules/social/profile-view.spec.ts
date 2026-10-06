import type { PublicProfile } from '../users/user.mapper';
import { buildProfileView, NO_RELATIONSHIP, ProfileFacts } from './profile-view';

const profile: PublicProfile = { id: 'u2', name: 'Sana', age: 23, gender: 'female', countryCode: 'PK', avatarUrl: '', bio: 'coffee first', interests: ['Music'], verified: false, vip: false, level: 3 };
const facts = (over: Partial<ProfileFacts> = {}): ProfileFacts => ({
  self: false,
  met: true,
  rel: NO_RELATIONSHIP,
  hideStats: false,
  online: true,
  counts: { followers: 5, following: 2 },
  stats: { matches: 40, likes: 9, gifts: 3 },
  badges: ['first_vibes'],
  ...over,
});

describe('profile tiers', () => {
  it('people who never met get nothing', () => {
    expect(buildProfileView(profile, facts({ met: false }))).toBeNull();
  });

  it('matched: the public profile and the relationship, nothing more', () => {
    expect(buildProfileView(profile, facts())).toEqual({ profile, tier: 'matched', level: 3, badges: ['first_vibes'], rel: NO_RELATIONSHIP });
  });

  it('a pending follow request is still the matched tier', () => {
    expect(buildProfileView(profile, facts({ rel: { ...NO_RELATIONSHIP, follow: 'requested' } }))?.tier).toBe('matched');
  });

  it('following: counts and stats, but no presence', () => {
    const v = buildProfileView(profile, facts({ rel: { ...NO_RELATIONSHIP, follow: 'following' } }));
    expect(v).toMatchObject({ tier: 'following', counts: { followers: 5, following: 2 }, stats: { matches: 40, likes: 9, gifts: 3 } });
    expect(v?.online).toBeUndefined();
  });

  it('friends: presence too, even without following', () => {
    expect(buildProfileView(profile, facts({ rel: { ...NO_RELATIONSHIP, friend: 'friends' } }))).toMatchObject({ tier: 'friends', online: true, counts: { followers: 5 } });
  });

  it('hidden stats are hidden from others but not from yourself', () => {
    expect(buildProfileView(profile, facts({ hideStats: true, rel: { ...NO_RELATIONSHIP, follow: 'following' } }))?.stats).toBe('hidden');
    expect(buildProfileView(profile, facts({ hideStats: true, self: true }))).toMatchObject({ tier: 'self', stats: { matches: 40 } });
  });
});
