/**
 * Where a notification leads in the web app, from its `route` + ids. Same
 * table as the server's `webPath` (backend notifications/catalog.ts), which
 * builds the links in e-mails and pushes.
 */
export function notificationPath(data: Record<string, string>): string {
  switch (data.route) {
    case "chat":
    case "call":
      return data.friendId ? `/chats/${data.friendId}` : "/chats";
    case "friends":
      // A friend request: their profile (Accept / Decline); requests no longer live in Chats.
      return data.userId ? `/u/${data.userId}` : "/notifications";
    case "notifications":
      return "/notifications";
    case "inbox":
      return "/chats/inbox";
    case "wallet":
      return "/wallet";
    case "store":
      return "/store";
    case "profile":
      return data.userId ? `/u/${data.userId}` : "/me";
    case "follow-requests":
      return "/me/follows";
    case "invite":
      return "/invite";
    case "partner":
      return "/partner";
    case "discover":
      return "/discover";
    default:
      return "/match";
  }
}
