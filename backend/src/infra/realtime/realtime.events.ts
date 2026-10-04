/**
 * Every event name the server pushes, in one place, so the server and the
 * app agree on spelling. (The Flutter client mirrors this list.)
 */
export const ServerEvent = {
  WalletUpdated: 'wallet:updated',
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

  RtcSignal: 'rtc:signal',

  FriendRequest: 'social:friend-request',
  FriendAccepted: 'social:friend-accepted',
  FriendRemoved: 'social:friend-removed',
  Message: 'social:message',
  PresenceChanged: 'social:presence',
} as const;

export type ServerEventName = (typeof ServerEvent)[keyof typeof ServerEvent];

export const userRoom = (userId: string): string => `user:${userId}`;
