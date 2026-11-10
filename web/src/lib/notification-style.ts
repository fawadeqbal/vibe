import type { Tone } from "./colors";

/** The filters on the Notifications page. */
export type NotificationFilter = "all" | "people" | "calls" | "money" | "account";

export interface NotificationStyle {
  icon: string;
  tone: Tone;
  /** Which filter (besides All) shows it; null = only All. */
  filter: Exclude<NotificationFilter, "all"> | null;
}

const S = (icon: string, tone: Tone, filter: NotificationStyle["filter"]): NotificationStyle => ({ icon, tone, filter });

/**
 * How a notification looks: the badge on a person's photo, or the coloured
 * tile for Vibe's own (money, account), and which filter it sits under.
 * `title` tells a failure from a success where the type covers both.
 */
export function notificationStyle(type: string, title = ""): NotificationStyle {
  const bad = /not completed|returned|couldn.t|stays/i.test(title);
  switch (type) {
    case "chat.message":
      return S("chat_bubble", "pink", "people");
    case "chat.gift":
      return S("redeem", "gold", "people");
    case "chat.reaction":
      return S("favorite", "pink", "people");
    case "call.missed":
    case "call.incoming":
      return S("call_end", "bad", "calls");
    case "call.ask":
      return S("videocam", "lavender", "calls");
    case "friend.request":
      return S("person_add", "violet", "people");
    case "friend.accepted":
      return S("how_to_reg", "ok", "people");
    case "follow.new":
    case "follow.accepted":
      return S("person_add_alt_1", "violet", "people");
    case "follow.request":
      return S("people_alt", "violet", "people");
    case "wave.new":
    case "wave.looking":
      return S("waving_hand", "gold", "people");
    case "discover.match":
      return S("favorite", "pink", "people");
    case "discover.superLike":
      return S("favorite", "gold", "people");
    case "discover.like":
    case "reminder.likesWaiting":
      return S("favorite_border", "pink", "people");
    case "discover.newPeople":
      return S("people_alt", "lavender", "people");
    case "match.someoneLooking":
      return S("videocam", "pink", null);
    case "referral.update":
    case "referral.milestone":
      return S("group_add", "gold", "people");
    case "reminder.vibeHourLive":
    case "reminder.vibeHourSoon":
      return S("local_fire_department", "pink", null);
    case "reminder.streak":
      return S("local_fire_department", "flame", "people");
    case "reminder.winback":
      return S("bolt", "gold", "money");
    case "reminder.recap":
      return S("insights", "lavender", null);
    case "payment.update":
      return bad ? S("error_outline", "bad", "money") : S("receipt_long", "ok", "money");
    case "cashout.update":
      return bad ? S("payments", "warn", "money") : S("payments", "gem", "money");
    case "goal.reached":
      return S("emoji_events", "gold", "money");
    case "partner.update":
      return S("workspace_premium", "gold", "money");
    case "account.warning":
      return S("warning_amber", "warn", "account");
    case "account.paused":
      return S("pause_circle", "warn", "account");
    case "account.appeal":
      return S("outlined_flag", "info", "account");
    case "account.verification":
      return bad ? S("error_outline", "bad", "account") : S("verified", "info", "account");
    case "team.message":
      return S("campaign", "pink-soft", "account");
    default:
      return S("notifications", "text2", null);
  }
}
