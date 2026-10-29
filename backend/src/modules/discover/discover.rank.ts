/** What the deck order looks at, per candidate. */
export interface RankInput {
  id: string;
  superLikedMe: boolean;
  likedMe: boolean;
  boosted: boolean;
  sameCountry: boolean;
  online: boolean;
  /** Epoch ms (0 = never). */
  lastSeenAt: number;
}

/**
 * Deck order: people who Super Liked you, then boosted people, then — to
 * make matches more likely — people who already liked you (never shown as
 * such), then your own country, online first, most recently seen first.
 */
export function rankCards(cards: RankInput[], limit: number): string[] {
  const score = (c: RankInput) =>
    (c.superLikedMe ? 1000 : 0) +
    (c.boosted ? 300 : 0) +
    (c.likedMe ? 120 : 0) +
    (c.sameCountry ? 60 : 0) +
    (c.online ? 40 : 0);
  return [...cards]
    .sort((a, b) => score(b) - score(a) || b.lastSeenAt - a.lastSeenAt || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((c) => c.id);
}
