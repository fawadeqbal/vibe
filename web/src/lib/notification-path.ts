/**
 * Where a notification leads in the web app: `open` (the page it is about)
 * or, for lines saved before that existed, `route`. Same table as the
 * server's `webPath` (backend notifications/catalog.ts), which builds the
 * links in pushes and e-mails. `noteId` (a line on the Notifications page)
 * lets Account status highlight that note.
 */
export function notificationPath(data: Record<string, string>, noteId?: string): string {
  const q = (k: string) => encodeURIComponent(data[k] ?? "");
  switch (data.open ?? data.route) {
    case "chat":
      if (!data.friendId) return "/chats";
      return data.messageId ? `/chats/${q("friendId")}?m=${q("messageId")}` : `/chats/${q("friendId")}`;
    case "call":
      return data.friendId ? `/chats/${q("friendId")}` : "/chats";
    case "calls":
      return data.userId ? `/u/${q("userId")}/calls` : "/chats";
    case "friends":
      return data.userId ? `/u/${q("userId")}` : "/notifications";
    case "profile":
      return data.userId ? `/u/${q("userId")}` : "/me";
    case "follow-requests":
      return "/me/follows?tab=requests";
    case "liked-you":
      return "/discover/liked-you";
    case "discover":
      return "/discover";
    case "invite":
      return "/invite";
    case "payment":
      return data.purchaseId ? `/wallet/payments/${q("purchaseId")}` : "/wallet";
    case "cashout":
      return data.cashoutId ? `/wallet/cashouts/${q("cashoutId")}` : "/wallet";
    case "goals":
      return "/wallet#goals";
    case "wallet":
      return "/wallet";
    case "store":
      return "/store";
    case "partner":
      return "/partner";
    case "account":
      return noteId ? `/me/status?note=${encodeURIComponent(noteId)}` : "/me/status";
    case "verification":
      return "/me/verification";
    case "team":
      return data.messageId ? `/news/${q("messageId")}` : "/notifications";
    case "recap":
      return "/me/recap";
    // Messages from Vibe are on the Notifications page now.
    case "inbox":
      return "/notifications";
    case "notifications":
      return "/notifications";
    default:
      return "/match";
  }
}
