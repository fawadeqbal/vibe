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
  /** This device was signed out (from another device's Settings → Devices, or by the team): go back to sign-in. */
  SessionEnded: 'session:ended',
  AccountWarning: 'account:warning',
  /** A moderator answered your appeal: `{ status: ACCEPTED | REJECTED, note }` (accepted = the pause is lifted). */
  AccountAppeal: 'account:appeal',
  Announcement: 'system:announcement',
  InboxMessage: 'inbox:message',
  /** A new line on the Notifications page: `{ item, unread }`. */
  ActivityNew: 'activity:new',
  /**
   * A notification while you're in the app (its push was skipped because you're online):
   * `{ key, group, title, body, data, at }`. The app shows a banner; tapping opens `data.open`.
   */
  NotificationShow: 'notification:show',
  /** Notifications were read (on another device too): `{ unread }`. */
  ActivityRead: 'activity:read',
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
  /** You asked to hear when someone's looking (POST /match/notify-me), and someone is now. One-shot. */
  MatchSomeoneLooking: 'match:someone-looking',
  /** Only your last partner is waiting: `{ partner: { id, name, avatarUrl }, at: ISO | null }` (null = no auto rematch). */
  MatchRematchSoon: 'match:rematch-soon',
  /** Your partner turned their camera or mic on/off: `{ matchId, camOn, micOn }`. */
  MatchMedia: 'match:media',
  /** Your partner's connection dropped (`lost`) or came back (`back`); the call waits for them: `{ matchId, state, graceSeconds? }`. */
  MatchPartnerConnection: 'match:partner-connection',
  /** You're back after your connection dropped and the call is still on: `{ matchId }`. */
  MatchResumed: 'match:resumed',
  /** New people joined Discover since you asked (POST /discover/notify-new): `{ count }`. At most once a day. */
  DiscoverNewPeople: 'discover:new-people',
  /** Someone waved at you: `{ from: PublicProfile, mutual }` (mutual = you had waved at them). */
  WaveNew: 'wave:new',
  /** Someone you waved with started looking for a match: `{ from: PublicProfile }`. */
  WaveLooking: 'wave:looking',

  /** You and someone liked each other in Discover: `{ friend: FriendView }` (chat is open). */
  DiscoverMatch: 'discover:match',
  /** Someone liked you in Discover: `{ superLike, from: PublicProfile | null, unseen }` (`from` only for a Super Like). */
  DiscoverLiked: 'discover:liked',

  /** Video calls in a chat changed: `{ friendId, mine, theirs }` (both true = calls on). */
  CallConsent: 'call:consent',
  /** A friend is calling you: `{ callId, from: PublicProfile, expiresAt }`. */
  CallIncoming: 'call:incoming',
  /** Your call is ringing on their side: `{ callId, to, expiresAt }` (also the POST reply). */
  CallRinging: 'call:ringing',
  /** A ringing call stopped: `{ callId, reason: 'declined' | 'no_answer' | 'cancelled' | 'accepted' | 'turned_off', reply? }`. Accepted calls continue as `match:found`. */
  CallEnded: 'call:ended',
  /** Your call reached their phone and is ringing there (the app, or a push with Vibe closed): `{ callId }`. Until then: "Connecting". */
  CallReached: 'call:reached',
  /** Voice → video during a friend call: `{ matchId, state: 'asked' | 'on' | 'declined', from? }`. */
  CallVideo: 'call:video',
  /** Your friend is typing to you: `{ friendId }` (lasts ~5 s). */
  ChatTyping: 'chat:typing',
  /** A message changed (reaction, unsent): the full message view. */
  MessageUpdated: 'message:updated',
  /** Your friend read your messages: `{ friendId, at }`. */
  MessagesRead: 'message:read',
  /** Your messages reached your friend's phone or an open tab: `{ friendId, at }` (two grey ticks). */
  MessagesDelivered: 'message:delivered',
  /** You cleared a chat (on another of your devices): `{ friendId, at }`. Only your side; they keep theirs. */
  ChatCleared: 'chat:cleared',

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

  /** To the inviter: one of their referrals changed `{ referral: ReferralPerson, event: 'joined' | 'qualified' | 'rewarded' | 'rejected', coins }`. */
  ReferralUpdated: 'referral:updated',
  /** To the inviter: a referral milestone was reached `{ index, count, reward: { kind: 'vip' | 'coins', amount } }`. */
  ReferralMilestone: 'referral:milestone',
  /** To a creator partner: application decided or payout changed `{ status, event, payout? }`. */
  AffiliateUpdated: 'affiliate:updated',
} as const;

export type ServerEventName = (typeof ServerEvent)[keyof typeof ServerEvent];

export const userRoom = (userId: string): string => `user:${userId}`;
