import { rankCards, type RankInput } from './discover.rank';

const card = (id: string, extra: Partial<RankInput> = {}): RankInput => ({
  id,
  superLikedMe: false,
  likedMe: false,
  boosted: false,
  sameCountry: false,
  online: false,
  lastSeenAt: 0,
  ...extra,
});

describe('rankCards', () => {
  it('puts Super Likes first, then boosts, then likes, then your country and online people', () => {
    const order = rankCards(
      [
        card('plain'),
        card('online', { online: true }),
        card('local', { sameCountry: true }),
        card('liked', { likedMe: true }),
        card('boost', { boosted: true }),
        card('super', { superLikedMe: true }),
      ],
      10,
    );
    expect(order).toEqual(['super', 'boost', 'liked', 'local', 'online', 'plain']);
  });

  it('breaks ties by who was seen most recently, and cuts to the limit', () => {
    expect(
      rankCards([card('old', { lastSeenAt: 1 }), card('new', { lastSeenAt: 5 }), card('mid', { lastSeenAt: 3 })], 2),
    ).toEqual(['new', 'mid']);
  });
});
