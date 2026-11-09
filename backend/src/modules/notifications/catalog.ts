import type { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent, ServerEventName } from '../../infra/realtime/realtime.events';
import type { PushCategory } from '../push/push-sender';

/**
 * Every notification Vibe sends, in one list. A notification has one piece
 * of content and goes out on up to three channels: push (phone / browser),
 * in-app (the inbox in Chats) and e-mail. Defaults are below; staff change
 * them per type in Admin → Configuration → Notifications, and people turn
 * groups off in Me → Notifications.
 *
 * To add one: add an entry and call `notifications.notify(userId, key, data)`
 * — or set `event` and it fires by itself when that realtime event reaches
 * someone.
 */

/** What people can switch on/off as a group (account alerts always go). */
export type NotifyGroup = 'messages' | 'calls' | 'friends' | 'reminders' | 'money' | 'account' | 'team';
export type Channel = 'push' | 'inApp' | 'email';
export const CHANNELS: Channel[] = ['push', 'inApp', 'email'];

export const GROUPS: { key: NotifyGroup; label: string; description: string; locked?: boolean }[] = [
  { key: 'messages', label: 'Messages', description: 'New messages, gifts and reactions in your chats' },
  { key: 'calls', label: 'Calls', description: 'Friends calling you, missed calls, video-call requests' },
  { key: 'friends', label: 'Friends and likes', description: 'Friend requests, followers, waves, likes and matches' },
  { key: 'reminders', label: 'Reminders', description: 'Vibe Hour, streaks, likes waiting, your weekly recap' },
  { key: 'money', label: 'Money', description: 'Payments, cash-outs, goals, partner payouts' },
  { key: 'team', label: 'News from Vibe', description: 'Messages from the Vibe team' },
  { key: 'account', label: 'Account and safety', description: 'Warnings, pauses, appeals, verification — always on', locked: true },
];

/** Android channel and quiet-hours behaviour for each group. */
export const GROUP_PUSH: Record<NotifyGroup, { category: PushCategory; urgent?: boolean }> = {
  messages: { category: 'messages' },
  calls: { category: 'messages', urgent: true },
  friends: { category: 'social' },
  reminders: { category: 'engagement' },
  money: { category: 'payments' },
  team: { category: 'inbox' },
  account: { category: 'inbox', urgent: true },
};

/** What a notification says, whatever the channel. */
export interface Content {
  title: string;
  body: string;
  /** Where a tap leads (route + ids; string values only). */
  data: Record<string, string>;
  /** Replaces an earlier notification with the same key (one per chat…). */
  collapseKey?: string;
  /** E-mail button text (default "Open Vibe"). */
  button?: string;
  /** Longer text for the inbox and e-mail (default: body). */
  detail?: string;
}

export interface BuildCtx {
  userId: string;
  prisma: PrismaService;
  /** True the first time `key` is seen within `seconds` (throttling). */
  once: (key: string, seconds?: number) => Promise<boolean>;
}

type P = Record<string, unknown>;

export interface NotificationType {
  key: string;
  group: NotifyGroup;
  label: string;
  /** Fires by itself when this realtime event reaches someone. */
  event?: ServerEventName;
  /** Default channels; staff can change them. */
  channels: Record<Channel, boolean>;
  /** Push even when the app is open (the app's own banner usually covers it). */
  pushWhenOnline?: boolean;
  /**
   * Also kept on the Notifications page (NotificationFeed), whatever the channels:
   * person = from someone (`data.userId` or `data.friendId` is who), system = from Vibe.
   * Chats, live calls and reminders aren't: they have their own places.
   */
  feed?: 'person' | 'system';
  build: (p: P, ctx: BuildCtx) => Promise<Content | null> | Content | null;
}

const first = (name: unknown, fallback: string) => String(name ?? '').trim().split(/\s+/)[0] || fallback;
const who = (v: unknown) => (v ?? {}) as { id?: string; name?: string };
const PUSH = { push: true, inApp: false, email: false };
const PUSH_INBOX = { push: true, inApp: true, email: false };
const ALL = { push: true, inApp: true, email: true };

export const CATALOG: NotificationType[] = [
  // ── Messages ─────────────────────────────────────────────────────────
  {
    key: 'chat.message',
    group: 'messages',
    label: 'New message',
    event: ServerEvent.Message,
    channels: PUSH,
    build: async (p, { prisma }) => {
      if (p.fromMe || p.kind === 'system' || p.giftId) return null;
      const f = await prisma.user.findUnique({ where: { id: String(p.friendId) }, select: { name: true } });
      return { title: f?.name || 'New message', body: String(p.text ?? '').slice(0, 140) || 'Sent you a message', data: { route: 'chat', friendId: String(p.friendId) }, collapseKey: `chat:${p.friendId}`, button: 'Reply' };
    },
  },
  {
    key: 'chat.gift',
    group: 'messages',
    label: 'Gift in a chat',
    event: ServerEvent.Message,
    channels: PUSH,
    build: async (p, { prisma }) => {
      if (p.fromMe || !p.giftId) return null;
      const f = await prisma.user.findUnique({ where: { id: String(p.friendId) }, select: { name: true } });
      return { title: f?.name || 'A friend', body: 'Sent you a gift 🎁', data: { route: 'chat', friendId: String(p.friendId) }, collapseKey: `chat:${p.friendId}` };
    },
  },
  {
    key: 'chat.reaction',
    group: 'messages',
    label: 'Reaction to your message',
    event: ServerEvent.MessageUpdated,
    channels: PUSH,
    build: async (p, { prisma, once }) => {
      const r = (p.reactions ?? {}) as { theirs?: string | null };
      if (!p.fromMe || p.unsent || !r.theirs) return null;
      if (!(await once(`react:${p.id}:${r.theirs}`, 86_400))) return null;
      const f = await prisma.user.findUnique({ where: { id: String(p.friendId) }, select: { name: true } });
      const text = String(p.text ?? '').slice(0, 60);
      return { title: first(f?.name, 'A friend'), body: `Reacted ${r.theirs} to "${text || 'your message'}"`, data: { route: 'chat', friendId: String(p.friendId) }, collapseKey: `chat:${p.friendId}` };
    },
  },

  // ── Calls ────────────────────────────────────────────────────────────
  {
    key: 'call.incoming',
    group: 'calls',
    label: 'A friend is calling',
    event: ServerEvent.CallIncoming,
    channels: PUSH,
    build: (p) => {
      const from = who(p.from);
      return { title: `${first(from.name, 'A friend')} is calling 📹`, body: 'Video call on Vibe — open to answer.', data: { route: 'call', callId: String(p.callId ?? ''), friendId: String(from.id ?? '') }, collapseKey: `call:${p.callId}` };
    },
  },
  {
    key: 'call.missed',
    feed: 'person',
    group: 'calls',
    label: 'Missed call',
    event: ServerEvent.CallEnded,
    channels: PUSH,
    build: (p) => {
      if (p.reason !== 'no_answer' && p.reason !== 'cancelled') return null;
      const from = p.from ? who(p.from) : null;
      if (!from) return null;
      return { title: 'Missed video call', body: `From ${first(from.name, 'a friend')}. Call back from the chat.`, data: { route: 'chat', friendId: String(from.id ?? '') }, collapseKey: `call:${p.callId}` };
    },
  },
  {
    key: 'call.ask',
    group: 'calls',
    label: 'Asked to allow video calls',
    event: ServerEvent.CallConsent,
    channels: PUSH,
    build: (p) => {
      if (!p.asked) return null;
      const from = who(p.from);
      return { title: `${first(from.name, 'A friend')} wants to allow video calls`, body: 'Say yes in the chat, or not now.', data: { route: 'chat', friendId: String(from.id ?? '') }, collapseKey: `call-ask:${from.id}` };
    },
  },

  // ── Friends and likes ────────────────────────────────────────────────
  {
    key: 'friend.request',
    feed: 'person',
    group: 'friends',
    label: 'Friend request',
    event: ServerEvent.FriendRequest,
    channels: PUSH,
    build: (p) => {
      const from = who(p.from);
      return { title: 'New friend request', body: `${from.name || 'Someone'} wants to be friends`, data: { route: 'friends', userId: String(from.id ?? '') } };
    },
  },
  {
    key: 'friend.accepted',
    feed: 'person',
    group: 'friends',
    label: 'Friend request accepted',
    event: ServerEvent.FriendAccepted,
    channels: PUSH,
    build: (p) => {
      const raw = (p.friend ?? {}) as { profile?: { id?: string; name?: string } };
      const f = who(raw.profile ?? raw);
      return { title: "You're friends now", body: `${f.name || 'Your friend'} accepted your request`, data: { route: 'chat', friendId: String(f.id ?? '') } };
    },
  },
  {
    key: 'follow.new',
    feed: 'person',
    group: 'friends',
    label: 'New follower',
    event: ServerEvent.FollowNew,
    channels: PUSH,
    build: async (p, { prisma, once, userId }) => {
      const from = who(p.from);
      if (!(await once(`follow:${from.id}:${userId}`))) return null;
      const back = from.id ? await prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: userId, followeeId: from.id } }, select: { status: true } }) : null;
      const body = back?.status === 'ACTIVE' ? `${from.name || 'Someone'} followed you back` : `${from.name || 'Someone'} started following you`;
      return { title: 'New follower', body, data: { route: 'profile', userId: String(from.id ?? '') } };
    },
  },
  {
    key: 'follow.request',
    feed: 'person',
    group: 'friends',
    label: 'Follow request',
    event: ServerEvent.FollowRequest,
    channels: PUSH,
    build: async (p, { once, userId }) => {
      const from = who(p.from);
      if (!(await once(`follow-req:${from.id}:${userId}`))) return null;
      return { title: 'Follow request', body: `${from.name || 'Someone'} wants to follow you`, data: { route: 'follow-requests', userId: String(from.id ?? '') } };
    },
  },
  {
    key: 'follow.accepted',
    feed: 'person',
    group: 'friends',
    label: 'Follow request accepted',
    event: ServerEvent.FollowAccepted,
    channels: PUSH,
    build: (p) => {
      const by = who(p.by);
      return { title: 'Request accepted', body: `${by.name || 'Someone'} accepted your follow request`, data: { route: 'profile', userId: String(by.id ?? '') } };
    },
  },
  {
    key: 'wave.new',
    feed: 'person',
    group: 'friends',
    label: 'Wave',
    event: ServerEvent.WaveNew,
    channels: PUSH,
    build: async (p, { once, userId }) => {
      const from = who(p.from);
      if (!(await once(`wave:${from.id}:${userId}`))) return null;
      const name = first(from.name, 'Someone');
      return p.mutual
        ? { title: `${name} waved back 👋`, body: "You're matched first when you're both looking. Open Vibe to meet.", data: { route: 'match', userId: String(from.id ?? '') }, collapseKey: `wave:${from.id}` }
        : { title: `${name} waved at you 👋`, body: "Wave back, and you're matched first when you're both on Vibe.", data: { route: 'match', userId: String(from.id ?? '') }, collapseKey: `wave:${from.id}` };
    },
  },
  {
    key: 'wave.looking',
    group: 'friends',
    label: 'Someone you waved with is looking',
    event: ServerEvent.WaveLooking,
    channels: PUSH,
    build: (p) => {
      const from = who(p.from);
      return { title: `${first(from.name, 'Someone you waved at')} is looking for a match now`, body: 'Open Vibe and press Start: you two are matched first.', data: { route: 'match' }, collapseKey: `wave-looking:${from.id}` };
    },
  },
  {
    key: 'discover.match',
    feed: 'person',
    group: 'friends',
    label: 'Discover match',
    event: ServerEvent.DiscoverMatch,
    channels: PUSH,
    build: (p) => {
      const f = ((p.friend ?? {}) as { profile?: { id?: string; name?: string } }).profile ?? {};
      return { title: "It's a match! 💞", body: `You and ${first(f.name, 'someone')} liked each other. Say hi!`, data: { route: 'chat', friendId: String(f.id ?? '') }, collapseKey: `discover-match:${f.id}` };
    },
  },
  {
    key: 'discover.superLike',
    feed: 'person',
    group: 'friends',
    label: 'Super Like',
    event: ServerEvent.DiscoverLiked,
    channels: PUSH,
    build: (p) => {
      const from = p.from ? who(p.from) : null;
      if (!p.superLike || !from) return null;
      return { title: `${first(from.name, 'Someone')} Super Liked you ⭐`, body: 'Open Discover to see them first.', data: { route: 'discover', userId: String(from.id ?? '') }, collapseKey: `discover-super:${from.id}` };
    },
  },
  {
    key: 'discover.like',
    feed: 'system',
    group: 'friends',
    label: 'Someone liked you (once a day)',
    event: ServerEvent.DiscoverLiked,
    channels: PUSH,
    build: async (p, { once, userId }) => {
      if (p.superLike) return null;
      if (!(await once(`discover-liked:${userId}`))) return null;
      return { title: 'Someone liked you 💜', body: 'Keep swiping in Discover — like them back and it’s a match.', data: { route: 'discover' }, collapseKey: 'discover-liked' };
    },
  },
  {
    key: 'discover.newPeople',
    group: 'friends',
    label: 'New people joined (asked for)',
    event: ServerEvent.DiscoverNewPeople,
    channels: PUSH,
    build: (p) => ({
      title: 'New people on Vibe ✨',
      body: Number(p.count) > 1 ? `${Number(p.count)} new people joined Discover. Come say hi.` : 'Someone new joined Discover. Come say hi.',
      data: { route: 'discover' },
      collapseKey: 'discover:new-people',
    }),
  },
  {
    key: 'match.someoneLooking',
    group: 'friends',
    label: "Someone's looking for a match (asked for)",
    event: ServerEvent.MatchSomeoneLooking,
    channels: PUSH,
    build: () => ({ title: "Someone's looking for a match 👋", body: 'You asked us to tell you. Open Vibe now to meet them.', data: { route: 'match' }, collapseKey: 'match:someone-looking' }),
  },
  {
    key: 'referral.update',
    feed: 'system',
    group: 'friends',
    label: 'Your invite: friend joined / rewarded',
    event: ServerEvent.ReferralUpdated,
    channels: PUSH,
    build: (p) => {
      const r = (p.referral ?? {}) as { id?: string; profile?: { name?: string }; steps?: { callsNeeded?: number; verifyNeeded?: boolean } };
      const name = first(r.profile?.name, 'Your friend');
      if (p.event === 'joined') {
        const what = [r.steps?.verifyNeeded ? 'verify' : null, r.steps?.callsNeeded ? `have ${r.steps.callsNeeded} calls` : null].filter(Boolean).join(' and ');
        return { title: `${name} joined Vibe with your invite 🎉`, body: what ? `When they ${what}, you both get coins.` : 'You both get coins soon.', data: { route: 'invite', referralId: String(r.id ?? '') }, collapseKey: `ref:${r.id}` };
      }
      if (p.event === 'rewarded' && Number(p.coins) > 0) return { title: `+${Number(p.coins)} coins`, body: `${name} is now active on Vibe.`, data: { route: 'invite', referralId: String(r.id ?? '') }, collapseKey: `ref:${r.id}` };
      return null;
    },
  },
  {
    key: 'referral.milestone',
    feed: 'system',
    group: 'friends',
    label: 'Invite milestone reached',
    event: ServerEvent.ReferralMilestone,
    channels: PUSH_INBOX,
    build: (p) => {
      const reward = (p.reward ?? {}) as { kind?: string; amount?: number };
      const title = reward.kind === 'vip' ? `You unlocked ${reward.amount} days of VIP 👑` : `+${Number(reward.amount).toLocaleString('en-US')} coins 🎖️`;
      return { title, body: `${p.count} friends joined Vibe with your invite.`, data: { route: 'invite' } };
    },
  },

  // ── Reminders (quiet hours, daily cap) ───────────────────────────────
  {
    key: 'reminder.vibeHourLive',
    group: 'reminders',
    label: 'Vibe Hour is live',
    channels: PUSH,
    build: (p) => ({ title: 'Vibe Hour is live 🔥', body: `Free filters and double XP for the next ${p.minutes} min`, data: { route: 'match' }, collapseKey: 'vibe-hour' }),
  },
  {
    key: 'reminder.vibeHourSoon',
    group: 'reminders',
    label: 'Vibe Hour starts soon (asked for)',
    channels: PUSH,
    build: (p) => ({ title: `Vibe Hour starts at ${p.time} 🔥`, body: `You asked us to remind you. Free filters and double XP for ${p.minutes} min.`, data: { route: 'match' }, collapseKey: 'vibe-hour' }),
  },
  {
    key: 'reminder.streak',
    group: 'reminders',
    label: 'Streak ends tonight',
    channels: PUSH,
    pushWhenOnline: true,
    build: (p) => ({ title: `🔥 ${p.count}-day streak`, body: `Your ${p.count}-day streak with ${p.name} ends at midnight`, data: { route: 'chat', friendId: String(p.friendId) }, collapseKey: `streak:${p.friendId}` }),
  },
  {
    key: 'reminder.winback',
    group: 'reminders',
    label: 'We miss you (free boost)',
    channels: { push: true, inApp: false, email: true },
    pushWhenOnline: true,
    build: (p) => ({ title: 'We miss you 👋', body: `A free ${p.minutes}-min boost is waiting for you`, data: { route: 'wallet' }, collapseKey: 'winback', button: 'Use my boost' }),
  },
  {
    key: 'reminder.recap',
    group: 'reminders',
    label: 'Your week on Vibe',
    channels: PUSH_INBOX,
    build: (p) => ({ title: 'Your week on Vibe ✨', body: `${p.likes} likes, ${p.gifts} gifts, ${p.gems} gems — see your recap`, detail: p.detail ? String(p.detail) : undefined, data: { route: 'inbox' }, collapseKey: 'recap' }),
  },
  {
    key: 'reminder.likesWaiting',
    group: 'reminders',
    label: 'Likes waiting for you',
    channels: { push: true, inApp: false, email: true },
    build: (p) => ({ title: `${p.count} ${Number(p.count) === 1 ? 'person likes' : 'people like'} you 💜`, body: 'Open Discover and like them back — it’s a match straight away.', data: { route: 'discover' }, collapseKey: 'likes-waiting', button: 'See who' }),
  },

  // ── Money ────────────────────────────────────────────────────────────
  {
    key: 'payment.update',
    feed: 'system',
    group: 'money',
    label: 'Payment done / not completed',
    event: ServerEvent.PaymentUpdated,
    channels: ALL,
    build: (p) => {
      if (p.status === 'SUCCEEDED') return { title: 'Payment received', body: p.productType === 'VIP_PLAN' ? 'Your VIP is active. Enjoy!' : 'Your coins are in your wallet.', data: { route: 'wallet', purchaseId: String(p.id) }, collapseKey: `pay:${p.id}`, button: 'Open my wallet' };
      if (p.status === 'FAILED' || p.status === 'EXPIRED') return { title: 'Payment not completed', body: String(p.failureReason ?? 'The payment did not go through. Nothing was charged.'), data: { route: 'store', purchaseId: String(p.id) }, collapseKey: `pay:${p.id}`, button: 'Try again' };
      return null;
    },
  },
  {
    key: 'cashout.update',
    feed: 'system',
    group: 'money',
    label: 'Cash-out sent / returned',
    event: ServerEvent.CashoutUpdated,
    channels: ALL,
    build: (p) => {
      if (p.status === 'PAID') return { title: 'Cash-out sent 💸', body: 'Your money is on its way to your account.', data: { route: 'wallet', cashoutId: String(p.id) } };
      if (p.status === 'REJECTED') return { title: 'Cash-out returned', body: `Your gems are back in your wallet. ${String(p.failureReason ?? '')}`.trim(), data: { route: 'wallet', cashoutId: String(p.id) } };
      return null;
    },
  },
  {
    key: 'goal.reached',
    feed: 'system',
    group: 'money',
    label: 'Gem goal reached',
    event: ServerEvent.GoalReached,
    channels: PUSH,
    build: (p) => ({ title: 'Goal reached 🎯', body: `You reached your goal of ${Number(p.goal).toLocaleString('en-US')} gems.`, data: { route: 'wallet' } }),
  },
  {
    key: 'partner.update',
    feed: 'system',
    group: 'money',
    label: 'Creator partner news and payouts',
    event: ServerEvent.AffiliateUpdated,
    channels: ALL,
    build: (p): Content | null => {
      if (p.event === 'approved') return { title: "You're a Vibe creator partner 🎉", body: 'Your partner link is ready. Open the partner dashboard to start sharing.', data: { route: 'partner' } };
      if (p.event === 'rejected') return { title: 'Creator partner application', body: "We couldn't approve your application this time.", data: { route: 'partner' } };
      if (p.event === 'suspended') return { title: 'Partner account paused', body: 'Open the partner dashboard for details.', data: { route: 'partner' } };
      const payout = (p.payout ?? {}) as { id?: string; usdCents?: number; failureReason?: string };
      if (p.event === 'payout_paid') return { title: 'Partner payout sent 💸', body: `$${(Number(payout.usdCents ?? 0) / 100).toFixed(2)} is on its way to your account.`, data: { route: 'partner', payoutId: String(payout.id ?? '') } };
      if (p.event === 'payout_rejected') return { title: 'Partner payout returned', body: `Your balance is available again. ${String(payout.failureReason ?? '')}`.trim(), data: { route: 'partner', payoutId: String(payout.id ?? '') } };
      return null;
    },
  },

  // ── Account and safety (always on) ───────────────────────────────────
  {
    key: 'account.warning',
    feed: 'system',
    group: 'account',
    label: 'Warning from the Vibe team',
    event: ServerEvent.AccountWarning,
    channels: ALL,
    pushWhenOnline: true,
    build: (p) => ({ title: 'A note from the Vibe team', body: String(p.message ?? 'Please follow the community guidelines.').slice(0, 300), data: { route: 'inbox' } }),
  },
  {
    key: 'account.paused',
    feed: 'system',
    group: 'account',
    label: 'Account paused',
    event: ServerEvent.AccountBanned,
    channels: ALL,
    pushWhenOnline: true,
    build: (p) => {
      const until = p.until ? new Date(String(p.until)) : null;
      const when = until ? until.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' }) : 'later';
      return { title: 'Your account is paused', body: `People reported your recent calls, so matching is off until ${when}. Your chats still work. Think it's a mistake? Tell us in the app.`, data: { route: 'match' } };
    },
  },
  {
    key: 'account.appeal',
    feed: 'system',
    group: 'account',
    label: 'Appeal answered',
    event: ServerEvent.AccountAppeal,
    channels: ALL,
    pushWhenOnline: true,
    build: (p) =>
      p.status === 'ACCEPTED'
        ? { title: "You're back on Vibe", body: 'We looked again and lifted the pause. Thanks for telling us.', data: { route: 'match' } }
        : { title: 'About your appeal', body: `We looked again and the pause stays for now.${p.note ? ` ${String(p.note)}` : ''}`, data: { route: 'inbox' } },
  },
  {
    key: 'account.verification',
    feed: 'system',
    group: 'account',
    label: 'Selfie verification result',
    channels: ALL,
    pushWhenOnline: true,
    build: (p) =>
      p.approved
        ? { title: "You're verified ✅", body: 'Your profile now shows the verified badge, and you can match with people in safe mode.', data: { route: 'profile', userId: String(p.userId ?? '') } }
        : { title: "We couldn't verify your selfie", body: `${p.reason ? `${String(p.reason)} ` : ''}You can try again with a new selfie.`, data: { route: 'profile', userId: String(p.userId ?? '') }, button: 'Try again' },
  },

  // ── News from Vibe ───────────────────────────────────────────────────
  {
    key: 'team.message',
    group: 'team',
    label: 'Message from the Vibe team (Messages)',
    event: ServerEvent.InboxMessage,
    // The campaign already put it in the inbox and e-mailed it.
    channels: PUSH,
    build: (p) => (p.fromCenter ? null : { title: String(p.title ?? 'Message from Vibe'), body: String(p.body ?? '').slice(0, 160), data: { route: 'inbox' } }),
  },
];

export const CATALOG_BY_KEY = new Map(CATALOG.map((t) => [t.key, t]));
export const TYPES_BY_EVENT = CATALOG.reduce((m, t) => (t.event ? m.set(t.event, [...(m.get(t.event) ?? []), t]) : m), new Map<ServerEventName, NotificationType[]>());

/** Where a notification's tap leads on the web app (e-mail buttons). */
export function webPath(data: Record<string, string>): string {
  switch (data.route) {
    case 'chat':
    case 'call':
      return data.friendId ? `/chats/${data.friendId}` : '/chats';
    case 'friends':
      return '/chats';
    case 'inbox':
      return '/chats/inbox';
    case 'wallet':
      return '/wallet';
    case 'store':
      return '/store';
    case 'profile':
      return data.userId ? `/u/${data.userId}` : '/me';
    case 'follow-requests':
      return '/me/follows';
    case 'invite':
      return '/invite';
    case 'partner':
      return '/partner';
    case 'discover':
      return '/discover';
    default:
      return '/match';
  }
}
