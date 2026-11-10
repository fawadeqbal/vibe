"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton, GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { KeyHint } from "@/components/ui/kbd";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { PillTabs } from "@/components/ui/tabs";
import { useIsDesktop } from "@/hooks/use-media-query";
import { errorMessage } from "@/lib/api/errors";
import { figure, thousands } from "@/lib/format";
import type { ActivityItem, Friend } from "@/lib/models";
import { type NotificationFilter, notificationStyle } from "@/lib/notification-style";
import { useActivity } from "@/stores/activity";
import { useEngagement } from "@/stores/engagement";
import { incomingOf, requestedOf, useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";

import { bucketOf, NotificationRow } from "./notification-row";

const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "people", label: "People" },
  { value: "calls", label: "Calls" },
  { value: "money", label: "Money" },
  { value: "account", label: "Account" },
];

const EMPTY: Record<NotificationFilter, { icon: string; title: string; body: string }> = {
  all: { icon: "notifications", title: "Nothing yet", body: "Friend requests, new followers, matches, missed calls and news about your coins show up here." },
  people: { icon: "people_alt", title: "No one yet", body: "Friend requests, follows, waves, likes and matches show up here." },
  calls: {
    icon: "videocam",
    title: "No missed calls",
    body: "When a friend calls and you miss it, it shows here. Tap it to see your calls with them and call back.",
  },
  money: { icon: "account_balance_wallet", title: "No money news", body: "Payments, cash-outs and goals show up here, each with its receipt." },
  account: { icon: "verified_user", title: "All good", body: "Notes from the Vibe team about your account show up here." },
};

/**
 * Notifications: every line opens the thing it is about — a person, a chat
 * at the message, your calls with someone, a receipt, a cash-out, Account
 * status. Filters on top, requests in one strip, then Today / This week /
 * Earlier. Opening the page clears the badge; this visit still shows which
 * lines are new.
 */
export function NotificationsView() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const all = useActivity((s) => s.items);
  const social = useSocial();
  const incoming = incomingOf(social);
  const sent = requestedOf(social);
  // Waiting friend requests live in Requests (Accept / Decline); their history line shows once answered.
  const items = all.filter((i) => !(i.type === "friend.request" && i.actor && incoming.some((f) => f.profile.id === i.actor!.id)));
  const loaded = useActivity((s) => s.loaded);
  const hasMore = useActivity((s) => s.cursor != null);
  const end = useRef<HTMLDivElement>(null);
  /** What was unread when the page opened: stays "new" for this visit, whatever reloads come later. */
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [showRequests, setShowRequests] = useState(false);

  useEffect(() => {
    let alive = true;
    const a = useActivity.getState();
    void (a.loaded ? a.refresh() : a.load()).then(() => {
      if (!alive) return;
      setFreshIds(
        new Set(
          useActivity
            .getState()
            .items.filter((i) => !i.read)
            .map((i) => i.id),
        ),
      );
      void useActivity.getState().markAllRead();
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = end.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void useActivity.getState().loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  const isNew = (i: ActivityItem) => !i.read || freshIds.has(i.id);
  const markAll = () => {
    setFreshIds(new Set());
    void useActivity.getState().markAllRead();
  };

  // Keyboard on a desktop: J / K move, Enter opens (the focused button), E marks all read.
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      const k = e.key.toLowerCase();
      if (k === "e") {
        e.preventDefault();
        markAll();
        return;
      }
      if (k !== "j" && k !== "k") return;
      const rows = [...document.querySelectorAll<HTMLElement>("[data-notification-row]")];
      if (!rows.length) return;
      e.preventDefault();
      const at = rows.indexOf(document.activeElement as HTMLElement);
      const next = at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + (k === "j" ? 1 : -1)));
      rows[next].focus();
      rows[next].scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop]);

  const inFilter = (i: ActivityItem, f: NotificationFilter) => f === "all" || notificationStyle(i.type, i.title).filter === f;
  const listed = items.filter((i) => inFilter(i, filter));
  const now = new Date();
  const groups = (["today", "week", "earlier"] as const)
    .map((b) => ({ b, rows: listed.filter((i) => bucketOf(i.at, now) === b) }))
    .filter((g) => g.rows.length);
  const requestCount = incoming.length + sent.length;
  const nothing = loaded && !items.length && !requestCount;

  if (showRequests && !desktop)
    return (
      <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
        <AppBar title="Requests" onBack={() => setShowRequests(false)} />
        <div className="quiet-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-8">
          <Requests incoming={incoming} sent={sent} />
          {!requestCount ? <p className="type-body pt-8 text-center text-[13.5px] text-muted">No requests right now.</p> : null}
        </div>
      </div>
    );

  const list = (
    <>
      {groups.map((g, gi) => (
        <section key={g.b}>
          <div className="flex items-center px-1 pt-[18px] pb-2 lg:pt-1">
            <h2 className="type-overline flex-1">{g.b === "today" ? "Today" : g.b === "week" ? "This week" : "Earlier"}</h2>
            {gi === 0 && listed.some(isNew) ? (
              <button type="button" onClick={markAll} className="type-label text-[12.5px] text-pink-soft">
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded-[22px] border border-line bg-surface lg:mb-5">
            {g.rows.map((i) => (
              <NotificationRow key={i.id} item={i} isNew={isNew(i)} />
            ))}
          </ul>
        </section>
      ))}
      {loaded && !listed.length ? (
        <EmptyState className="py-16" icon={EMPTY[filter].icon} iconVariant="outlined" title={EMPTY[filter].title} body={EMPTY[filter].body} />
      ) : null}
      {!hasMore && listed.length ? <p className="type-body pt-5 text-center text-[12px] text-muted">We keep notifications for 90 days.</p> : null}
      {hasMore ? (
        <div ref={end} className="flex justify-center p-4">
          <Spinner size={22} stroke={2} />
        </div>
      ) : null}
    </>
  );

  const tabs = <PillTabs label="Show" value={filter} onChange={setFilter} tabs={FILTERS} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:h-dvh">
      <AppBar
        title="Notifications"
        onBack={desktop ? undefined : () => router.back()}
        className="lg:h-[72px] lg:px-7 [&_h1]:lg:text-[26px]"
        actions={<CircleIconButton icon="settings" label="Notification settings" onClick={() => router.push("/me/notifications")} />}
      >
        {desktop ? (
          <div className="flex min-w-0 items-center gap-6">
            <h1 className="type-title-lg text-[26px]">Notifications</h1>
            {tabs}
          </div>
        ) : undefined}
      </AppBar>
      {!loaded ? (
        <div className="flex flex-1 justify-center py-20">
          <Spinner />
        </div>
      ) : nothing ? (
        <EmptyState className="flex-1" icon="notifications" iconVariant="outlined" title="Nothing " accent="yet" body={EMPTY.all.body} />
      ) : desktop ? (
        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-7 pt-2 pb-8">
          <div className="mx-auto flex w-full max-w-[1040px] items-start gap-6">
            <div className="min-w-0 flex-1">{list}</div>
            <aside className="sticky top-0 flex w-[360px] shrink-0 flex-col gap-4">
              {requestCount ? (
                <div className="overflow-hidden rounded-[22px] border border-line bg-surface">
                  <div className="flex items-center px-4 pt-4 pb-1">
                    <span className="type-title flex-1 text-[15px]">Requests</span>
                    <span className="type-label rounded-full bg-pink/16 px-2 py-0.5 text-[12px] text-pink-soft">{requestCount}</span>
                  </div>
                  <ul className="flex flex-col px-2 pb-2">
                    {incoming.map((f) => (
                      <RequestRow key={f.profile.id} f={f} incoming />
                    ))}
                    {sent.map((f) => (
                      <RequestRow key={f.profile.id} f={f} incoming={false} />
                    ))}
                  </ul>
                </div>
              ) : null}
              <WeekCard />
              <div className="flex flex-col gap-2 px-1">
                <KeyHint k="J" label="Next" />
                <KeyHint k="K" label="Previous" />
                <KeyHint k="Enter" label="Open" />
                <KeyHint k="E" label="Mark all read" />
              </div>
            </aside>
          </div>
        </div>
      ) : (
        <>
          {/* The filters stay put; only the notifications under them scroll. */}
          <div className="shrink-0 px-4 pt-1 pb-1">{tabs}</div>
          <div className="quiet-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-8">
            {requestCount ? <RequestsStrip incoming={incoming} sent={sent} onOpen={() => setShowRequests(true)} /> : null}
            {list}
          </div>
        </>
      )}
    </div>
  );
}

/** Phone: one line for every request, opening the Requests list. */
function RequestsStrip({ incoming, sent, onOpen }: { incoming: Friend[]; sent: Friend[]; onOpen: () => void }) {
  const people = [...incoming, ...sent];
  const names = incoming.map((f) => f.profile.name.split(" ")[0]);
  const text = names.length
    ? names.length <= 2
      ? `${names.join(" and ")} ${names.length === 1 ? "wants" : "want"} to be friends`
      : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more want to be friends`
    : `Waiting for ${sent.length === 1 ? sent[0].profile.name.split(" ")[0] : `${sent.length} people`} to accept`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-2 flex w-full items-center gap-3 rounded-[22px] border border-line bg-surface px-3.5 py-3 text-left transition-colors hover:bg-white/3"
      aria-label={`Requests: ${text}`}
    >
      <span className="flex shrink-0">
        {people.slice(0, 2).map((f, i) => (
          <span key={f.profile.id} className="flex rounded-full border-2 border-surface" style={{ marginLeft: i ? -12 : 0 }}>
            <Avatar url={f.profile.avatarUrl} name={f.profile.name} size={34} />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="type-title block text-[14.5px]">Requests</span>
        <span className="type-body block truncate text-[12.5px] text-text2">{text}</span>
      </span>
      {incoming.length ? (
        <span className="type-label flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-pink px-1.5 text-[12px] font-bold text-white">
          {incoming.length}
        </span>
      ) : null}
      <Icon name="chevron_right" size={20} className="text-muted" />
    </button>
  );
}

function Requests({ incoming, sent }: { incoming: Friend[]; sent: Friend[] }) {
  return (
    <>
      {incoming.length ? (
        <RequestSection title={`Friend requests · ${incoming.length}`}>
          {incoming.map((f) => (
            <RequestRow key={f.profile.id} f={f} incoming />
          ))}
        </RequestSection>
      ) : null}
      {sent.length ? (
        <RequestSection title={`Sent requests · ${sent.length}`}>
          {sent.map((f) => (
            <RequestRow key={f.profile.id} f={f} incoming={false} />
          ))}
        </RequestSection>
      ) : null}
    </>
  );
}

function RequestSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="type-overline px-1 pt-[18px] pb-2">{title}</h2>
      <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded-[22px] border border-line bg-surface px-2">{children}</ul>
    </section>
  );
}

/** A friend request still waiting: theirs (Accept / Decline) or yours (Cancel). */
function RequestRow({ f, incoming }: { f: Friend; incoming: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const p = f.profile;
  const first = p.name.split(" ")[0];
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      toast(errorMessage(e), { error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
      <button type="button" onClick={() => router.push(`/u/${p.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar url={p.avatarUrl} name={p.name} size={42} />
        <span className="min-w-0 flex-1">
          <span className="type-title block truncate text-[14px] font-semibold">
            {p.name}, {p.age}
          </span>
          <span className="type-body block truncate text-[12.5px] text-text2">{incoming ? "Wants to be friends" : `Waiting for ${first}`}</span>
        </span>
      </button>
      {incoming ? (
        <span className="flex shrink-0 gap-1.5">
          <GhostButton
            label="Decline"
            height={34}
            className="px-3 text-text2 [&>span]:text-[13px]"
            disabled={busy}
            onClick={() => void act(() => useSocial.getState().decline(p.id))}
          />
          <GradientButton
            label="Accept"
            height={34}
            expand={false}
            className="px-[13px] [&>span]:text-[13px]"
            busy={busy}
            onClick={() => void act(() => useSocial.getState().accept(p.id), `You and ${first} are friends now`)}
          />
        </span>
      ) : (
        <GhostButton
          label="Cancel"
          height={34}
          className="shrink-0 px-3 text-text2 [&>span]:text-[13px]"
          disabled={busy}
          onClick={() => void act(() => useSocial.getState().cancel(p.id))}
        />
      )}
    </li>
  );
}

/** Desktop: last week at a glance, opening the recap. */
function WeekCard() {
  const router = useRouter();
  const recap = useEngagement((s) => s.recap);
  useEffect(() => {
    void useEngagement.getState().loadRecap();
  }, []);
  if (!recap) return null;
  return (
    <button
      type="button"
      onClick={() => router.push("/me/recap")}
      className="rounded-[22px] border border-white/10 p-[18px] text-left transition-[filter] hover:brightness-110"
      style={{ backgroundImage: "linear-gradient(135deg, rgb(255 61 143 / .18), rgb(139 92 246 / .18))" }}
    >
      <span className="type-label block text-[12.5px] text-text2">Your week</span>
      <span className="type-number mt-1 block text-[30px] leading-none font-extrabold tracking-[-1px]">
        {figure(recap.likesReceived)} <span className="text-[15px] font-semibold tracking-normal">likes</span>
      </span>
      <span className="type-body mt-1.5 block text-[13px] text-text2">
        {thousands(recap.giftsReceived)} gifts · +{figure(recap.gemsEarned)} gems · {thousands(recap.newFollowers)} followers
      </span>
      <span className="type-label mt-2.5 block text-[13px] text-pink-soft">See your recap →</span>
    </button>
  );
}
