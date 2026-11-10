"use client";

import { type ReactNode, useEffect } from "react";

import { pickReport } from "@/components/shared/report-sheet";
import { confirm } from "@/components/shared/dialogs";
import { Icon } from "@/components/ui/icon";
import { errorMessage } from "@/lib/api/errors";
import { genderLabel } from "@/lib/models";
import { type DiscoverCard, useDiscover } from "@/stores/discover";
import { useFollows } from "@/stores/follows";
import { useSocial } from "@/stores/social";
import { openSheet, toast } from "@/stores/ui";
import { cn } from "@/lib/cn";

import { activeLabel, InterestChip, sortedInterests } from "./discover-card";

/**
 * Tap ⓘ on a card: the whole profile — big photo, who they are, bio and every
 * interest (shared ones first) — with the same buttons under it. ⋯ reports
 * or blocks. (Design: Discover · full profile.)
 */
export function DiscoverProfile({ c, onClose, actions }: { c: DiscoverCard; onClose: () => void; actions: ReactNode }) {
  const p = c.profile;
  const first = p.name.split(" ")[0] || p.name;
  const shared = new Set(c.sharedInterests);
  const facts = [p.country.name, genderLabel[p.gender], p.level ? `Level ${p.level}` : null, activeLabel(c) || null].filter(Boolean).join(" · ");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const more = () => reportOrBlock(c, onClose);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${p.name}'s profile`} className="fixed inset-0 z-[52] flex flex-col overflow-hidden bg-bg lg:left-[92px]">
      <div className="mx-auto flex min-h-0 w-full max-w-[560px] flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative h-[min(470px,58vh)] shrink-0 bg-surface">
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: "center 30%" }} />
            ) : null}
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[140px]"
              style={{ background: "linear-gradient(to top, var(--color-bg), rgb(11 10 16 / 0))" }}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to the card"
              className="absolute top-[calc(12px+env(safe-area-inset-top))] left-3 flex size-10 items-center justify-center rounded-full border border-white/10 bg-bg2/52 text-text backdrop-blur-[18px]"
            >
              <Icon name="arrow_back" variant="outlined" size={21} />
            </button>
            <button
              type="button"
              onClick={() => void more()}
              aria-label="More: report or block"
              className="absolute top-[calc(12px+env(safe-area-inset-top))] right-3 flex size-10 items-center justify-center rounded-full border border-white/10 bg-bg2/52 text-text backdrop-blur-[18px]"
            >
              <Icon name="more_horiz" size={21} />
            </button>
          </div>
          <div className="relative -mt-10 px-5 pb-6">
            <h2 className="flex items-center gap-2 text-[30px] font-bold tracking-[-0.035em]">
              {first}
              {p.age ? `, ${p.age}` : ""}
              {p.verified ? <Icon name="verified" size={22} className="text-trust" label="Verified" /> : null}
            </h2>
            <p className="mt-1 text-[13.5px] text-text2">{facts}</p>
            {p.bio ? <p className="mt-3 text-[15px] leading-[1.5]">{p.bio}</p> : null}
            {p.interests.length ? (
              <>
                <p className="type-overline mt-[18px] mb-2.5 text-[12px] text-muted">Interests</p>
                <div className="flex flex-wrap gap-1.5">
                  {sortedInterests(p, c.sharedInterests).map((i) => (
                    <InterestChip key={i} label={i} shared={shared.has(i)} glass={false} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 px-4 pt-2 pb-[calc(18px+env(safe-area-inset-bottom))]">{actions}</div>
      </div>
    </div>
  );
}

/** Report or block from Discover; either way they leave your deck. */
export async function reportOrBlock(c: DiscoverCard, onDone: () => void) {
  const p = c.profile;
  const first = p.name.split(" ")[0] || p.name;
  const pick = await openSheet<"report" | "block">((close) => (
    <div className="px-5 pt-2.5 pb-5">
      <h2 className="mt-1 mb-3 text-[18px] font-bold">{first}</h2>
      <button type="button" onClick={() => close("report")} className="flex w-full items-center gap-3.5 px-1 py-3 text-left text-bad">
        <span className="flex size-10 items-center justify-center rounded-xl bg-bad/12">
          <Icon name="flag" size={21} />
        </span>
        <span className="text-[15px] font-semibold">Report {first}</span>
      </button>
      <button type="button" onClick={() => close("block")} className="flex w-full items-center gap-3.5 px-1 py-3 text-left text-bad">
        <span className="flex size-10 items-center justify-center rounded-xl bg-bad/12">
          <Icon name="block" size={21} />
        </span>
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold">Block {first}</span>
          <span className="text-[12px] text-text2">You won&apos;t see each other again</span>
        </span>
      </button>
    </div>
  ));
  try {
    if (pick === "report") {
      const choice = await pickReport(p.name, "person");
      if (!choice) return;
      await useFollows.getState().report(p.id, choice);
      toast(`Thanks. ${first} was reported and blocked.`);
    } else if (pick === "block") {
      if (!(await confirm({ title: `Block ${first}?`, body: "You won't see each other in Discover, matches or chats.", ok: "Block", okTone: "bad" }))) return;
      await useSocial.getState().block(p);
      toast(`${first} is blocked`);
    } else return;
    onDone();
    // Out of your deck either way.
    void useDiscover.getState().swipe(c, "pass");
  } catch (e) {
    toast(errorMessage(e), { error: true });
  }
}

/**
 * Desktop: the whole profile of the card on top, beside the deck, so you
 * read who they are without opening anything. Follows the deck as you swipe.
 */
export function DiscoverAboutPanel({ c, className }: { c: DiscoverCard; className?: string }) {
  const p = c.profile;
  const first = p.name.split(" ")[0] || p.name;
  const shared = new Set(c.sharedInterests);
  const active = activeLabel(c);
  // Four quick facts as tiles (the desktop design); only the ones we know.
  const facts: { label: string; value: string; tone?: string }[] = [
    { label: "From", value: p.country.name },
    { label: "Age", value: [genderLabel[p.gender], p.age ? `${p.age}` : null].filter(Boolean).join(" · ") },
    ...(p.intent ? [{ label: "Here to", value: INTENT_SHORT[p.intent] }] : []),
    ...(p.level ? [{ label: "Level", value: `Level ${p.level}`, tone: "text-lavender" }] : []),
  ];
  const both = c.sharedInterests.slice(0, 2);
  return (
    <section aria-label={`About ${first}`} className={cn("flex flex-col gap-[18px] rounded-[24px] border border-line bg-surface p-[22px]", className)}>
      <div className="flex items-center gap-2">
        <h2 className="type-title truncate text-[20px] tracking-[-0.02em]">About {first}</h2>
        {p.verified ? <Icon name="verified" size={18} className="shrink-0 text-trust" label="Verified" /> : null}
        <span className="flex-1" />
        {active ? <span className="type-label shrink-0 text-[12.5px] text-ok">{active}</span> : null}
      </div>
      {p.bio ? (
        <p className="type-body text-[15px] leading-[1.5] text-text">“{p.bio}”</p>
      ) : (
        <p className="type-body text-[13.5px] text-muted">{first} hasn&apos;t written a bio yet.</p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {facts.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-0.5 rounded-[16px] bg-surface2 px-3.5 py-3">
            <span className="type-body text-[11.5px] text-muted">{f.label}</span>
            <span className={cn("type-title truncate text-[14.5px] font-bold", f.tone)}>{f.value}</span>
          </div>
        ))}
      </div>
      {p.interests.length ? (
        <div className="flex flex-col gap-2.5">
          <p className="type-overline">Interests</p>
          <div className="flex flex-wrap gap-1.5">
            {sortedInterests(p, c.sharedInterests).map((i) => (
              <InterestChip key={i} label={i} shared={shared.has(i)} glass={false} />
            ))}
          </div>
          {both.length ? <p className="type-body text-[12.5px] text-text2">You both like {both.join(" and ").toLowerCase()}.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/** "Report or block" for the person on top of the deck (desktop, under the side cards). */
export function ReportOrBlockButton({ c }: { c: DiscoverCard }) {
  return (
    <button
      type="button"
      onClick={() => void reportOrBlock(c, () => undefined)}
      className="type-label flex h-10 items-center justify-center gap-2 self-start rounded-full border border-white/10 px-4 text-[13px] text-text2 hover:text-text"
    >
      <Icon name="flag" size={17} />
      Report or block
    </button>
  );
}

const INTENT_SHORT: Record<NonNullable<DiscoverCard["profile"]["intent"]>, string> = {
  chat: "Chat",
  friends: "Make friends",
  dating: "Date",
  open: "Not sure yet",
};
