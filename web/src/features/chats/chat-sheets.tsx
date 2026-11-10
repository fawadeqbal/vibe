"use client";

import { confirm } from "@/components/shared/dialogs";
import { pickReport } from "@/components/shared/report-sheet";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import type { MenuItem } from "@/components/ui/menu";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { date } from "@/lib/format";
import { streakDays } from "@/lib/engagement";
import type { Friend } from "@/lib/models";
import { useFollows } from "@/stores/follows";
import { useSession } from "@/stores/session";
import { useSocial } from "@/stores/social";
import { openSheet, toast } from "@/stores/ui";

/**
 * ⋯ in a chat: who this is (and since when), their profile, calls, then
 * remove, report and block. (Design: Chat · more.)
 */
export function openChatMore({ f, callItems, onProfile, onGone }: { f: Friend; callItems: MenuItem[]; onProfile: () => void; onGone: () => void }) {
  const p = f.profile;
  const first = p.name.split(" ")[0] || p.name;
  return openSheet<void>((close) => {
    const run = (fn: () => void | Promise<void>) => async () => {
      close();
      try {
        await fn();
      } catch (e) {
        toast(errorMessage(e), { error: true });
      }
    };
    const callsSub =
      f.calls.mine && f.calls.theirs
        ? f.calls.mineVideo && f.calls.theirsVideo
          ? "Voice and video allowed"
          : "Voice calls allowed"
        : f.calls.mine
          ? `Waiting for ${first}`
          : "Off";
    return (
      <div className="flex flex-col px-5 pt-1 pb-5">
        <div className="mb-3 flex items-center gap-3">
          <Avatar url={p.avatarUrl} name={p.name} size={48} ring />
          <span className="flex min-w-0 flex-col">
            <span className="type-title truncate text-[17px]">{p.name}</span>
            <span className="type-body truncate text-[12.5px] text-text2">
              Friends since {date(f.since)}
              {f.streak.count > 0 ? ` · ${streakDays(f.streak.count)}` : ""}
            </span>
          </span>
        </div>
        <Row icon="person" title="View profile" onClick={run(onProfile)} />
        {callItems.length ? (
          <>
            <p className="type-overline mt-3 mb-1 px-1">Calls · {callsSub}</p>
            {callItems.map((it) => (
              <Row
                key={it.label}
                icon={it.tone === "bad" ? "phone_disabled" : "call"}
                title={it.label}
                tone={it.tone === "bad" ? "bad" : undefined}
                onClick={run(it.onSelect)}
              />
            ))}
          </>
        ) : null}
        <div className="my-2 h-px bg-line-soft" />
        <Row
          icon="delete_sweep"
          title="Clear chat"
          sub={`For you only · ${first} keeps the messages`}
          onClick={run(async () => {
            if (
              !(await confirm({
                title: "Clear this chat?",
                body: `All messages are removed for you, on all your devices. ${first} still has them, and nothing tells ${first}. New messages show up as usual.`,
                ok: "Clear chat",
                okTone: "bad",
              }))
            )
              return;
            await useSocial.getState().clearChat(p.id);
            toast("Chat cleared");
          })}
        />
        <Row
          icon="person_remove"
          title="Remove friend"
          sub="You can still find each other on calls"
          onClick={run(async () => {
            if (!(await confirm({ title: `Remove ${first}?`, body: "You'll stop being friends. Your chat goes too.", ok: "Remove", okTone: "bad" }))) return;
            await useSocial.getState().remove(p.id);
            onGone();
          })}
        />
        <Row
          icon="flag"
          title={`Report ${first}`}
          tone="bad"
          onClick={run(async () => {
            const choice = await pickReport(p.name, "person");
            if (!choice) return;
            await useFollows.getState().report(p.id, choice);
            toast(`Thanks. ${first} was reported${choice.block ? " and blocked" : ""}.`);
            if (choice.block) {
              await useSocial.getState().load();
              onGone();
            }
          })}
        />
        <Row
          icon="block"
          title={`Block ${first}`}
          sub={`${first} can't message or meet you again`}
          tone="bad"
          onClick={run(async () => {
            if (!(await confirm({ title: `Block ${first}?`, body: "You won't see each other in Discover, matches or chats.", ok: "Block", okTone: "bad" })))
              return;
            await useSocial.getState().block(p);
            onGone();
          })}
        />
      </div>
    );
  });
}

function Row({ icon, title, sub, tone, onClick }: { icon: string; title: string; sub?: string; tone?: "bad"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-3.5 rounded-2xl px-1 py-[11px] text-left hover:bg-white/3", tone ? "text-bad" : "text-text")}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone ? "bg-bad/12" : "bg-white/5")}>
        <Icon name={icon} size={20} className={tone ? "text-bad" : "text-text2"} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">{title}</span>
        {sub ? <span className="text-[12px] text-text2">{sub}</span> : null}
      </span>
      {tone ? null : <Icon name="chevron_right" size={18} className="text-muted" />}
    </button>
  );
}

/**
 * A chat with nothing in it yet: "Say hi to Sana", what you have in common,
 * a wave, and three openers that send with one tap. (Design: Chat · empty.)
 */
export function ChatHello({ f, onSend }: { f: Friend; onSend: (text: string) => void }) {
  const me = useSession((s) => s.me);
  const p = f.profile;
  const first = p.name.split(" ")[0] || p.name;
  const shared = p.interests.filter((i) => me?.interests.includes(i));
  const topic = shared[0] ?? p.interests[0];
  const openers = [
    topic ? `What ${topic.toLowerCase()} are you into lately?` : "What are you into lately?",
    "Where's the next place you want to go?",
    `Hi ${first}! Fun call earlier`,
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-6 text-center">
      <Avatar url={p.avatarUrl} name={p.name} size={88} ring />
      <h2 className="type-display mt-4 text-[24px]">
        Say hi to <span className="type-serif text-[28px] text-pink-soft">{first}</span>
      </h2>
      <p className="type-body mt-1 text-[13.5px] text-text2">
        {shared.length ? `You met on a call · you both like ${shared.slice(0, 2).join(" and ")}` : "You met on a call"}
      </p>
      <button
        type="button"
        onClick={() => onSend("👋")}
        className="type-label mt-4 flex h-10 items-center gap-2 rounded-full border border-gold/30 bg-gold/12 px-4 text-[14px] font-bold text-gold hover:brightness-125"
      >
        <span aria-hidden>👋</span> Send a wave
      </button>
      <div className="mt-7 w-full max-w-[420px] text-left">
        <p className="type-overline mb-2 px-1">Or start with</p>
        <div className="flex flex-col gap-2">
          {openers.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onSend(o)}
              className="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 text-left hover:bg-white/4"
            >
              <span className="type-body min-w-0 flex-1 text-[14px] font-medium text-text">{o}</span>
              <Icon name="send" size={17} className="shrink-0 text-muted" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
