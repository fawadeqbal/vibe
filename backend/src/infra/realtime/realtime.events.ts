/**
 * Every event name the server pushes, in one place, so the server and the
 * app agree on spelling. (The Flutter client mirrors this list.)
 */
export const ServerEvent = {
  WalletUpdated: 'wallet:updated',
  /** A purchase changed status outside the request (wallet approved, card paid, bank confirmed, expired). */
  PaymentUpdated: 'payment:updated',
  /** A cash-out changed status (paid, returned). */
  CashoutUpdated: 'cashout:updated',
  AccountBanned: 'account:banned',
  AccountWarning: 'account:warning',
  Announcement: 'system:announcement',
  InboxMessage: 'inbox:message',
  /** Staff changed prices or rules; re-read GET /catalog. */
  CatalogUpdated: 'catalog:updated',

  MatchSearching: 'match:searching',
  MatchFound: 'match:found',
  MatchEnded: 'match:ended',
  MatchChat: 'match:chat',
  MatchLiked: 'match:liked',
  MatchGift: 'match:gift',
  MatchFriendRequest: 'match:friend-request',
  MatchError: 'match:error',
  /** Both liked each other in this call: `{ matchId }` ("It's a vibe!"). */
  MatchMutual: 'match:mutual',
  /** An icebreaker prompt: `{ matchId, game, round, prompt: { text, options? }, by: 'me' | 'partner' }`. */
  MatchGame: 'match:game',
  /** `{ matchId, round, mine, theirs, revealed, partnerAnswered }` — theirs only once both answered. */
  MatchGameAnswer: 'match:game-answer',
  MatchGameClosed: 'match:game-closed',

  RtcSignal: 'rtc:signal',

  FriendRequest: 'social:friend-request',
  FriendAccepted: 'social:friend-accepted',
  FriendRemoved: 'social:friend-removed',
  /** Someone followed you: `{ from: PublicProfile }`. */
  FollowNew: 'social:follow-new',
  /** Someone asked to follow your private account: `{ from: PublicProfile }`. */
  FollowRequest: 'social:follow-request',
  /** Your follow request was accepted: `{ by: PublicProfile }`. */
  FollowAccepted: 'social:follow-accepted',
  /** A follow between you and `userId` ended (unfollow, removed). Refresh. */
  FollowRemoved: 'social:follow-removed',
  Message: 'social:message',
  PresenceChanged: 'social:presence',
  /** A friend streak changed (counted, restored): `{ friendId, streak }`. */
  Streak: 'social:streak',

  /** Vibe Hour started or ended: `{ active, startsAt, endsAt }` (broadcast). */
  VibeHour: 'engagement:vibe-hour',
  /** Someone you follow or a friend posted a moment: `{ authorId }`. Refresh the feed. */
  MomentNew: 'moments:new',
  /** `{ level }` */
  LevelUp: 'progress:level-up',
  /** Gems reached the wallet goal: `{ goal }`. */
  GoalReached: 'wallet:goal-reached',
} as const;

export type ServerEventName = (typeof ServerEvent)[keyof typeof ServerEvent];

export const userRoom = (userId: string): string => `user:${userId}`;
