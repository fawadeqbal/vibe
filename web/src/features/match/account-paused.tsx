"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextArea } from "@/components/ui/text-field";
import { Headline } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { ApiError } from "@/lib/api/errors";
import { asMap } from "@/lib/api/mappers";
import { clock } from "@/lib/format";
import { api } from "@/stores/services";
import { useSession } from "@/stores/session";
import { openSheet, toast } from "@/stores/ui";

export type AppealStatus = "OPEN" | "ACCEPTED" | "REJECTED";

/** "23:41:05" for under a day, "2 days 4h" for longer. */
export function pausedFor(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 86_400) return clock(s);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  return `${d} ${d === 1 ? "day" : "days"}${h ? ` ${h}h` : ""}`;
}

const RULES: { icon: string; text: string }[] = [
  { icon: "sentiment_satisfied", text: "Be kind — no insults or hate" },
  { icon: "checkroom", text: "Keep it clean — clothes on, nothing sexual" },
  { icon: "block", text: "No ads, selling or asking for money" },
  { icon: "cake", text: "Everyone here is 18 or older" },
];

/**
 * Matching is paused after reports: when it comes back (a live countdown),
 * what still works, the rules in plain words, and "this is a mistake".
 */
export function AccountPaused({ until }: { until: Date }) {
  const now = useNow(1000);
  const left = Math.ceil((until.getTime() - now) / 1000);
  const [appeal, setAppeal] = useState<AppealStatus | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    api
      .get("/me/appeal")
      .then((r) => live && setAppeal((asMap(asMap(r).appeal).status as AppealStatus | undefined) ?? null))
      .catch(() => live && setAppeal(null));
    return () => {
      live = false;
    };
  }, [until]);

  // Time's up: matching is back.
  useEffect(() => {
    if (left <= 0) useSession.setState({ pausedUntil: null });
  }, [left]);

  const tellUs = async () => {
    const sent = await openAppealSheet();
    if (sent) setAppeal("OPEN");
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full w-full max-w-[460px] flex-col px-5 pt-[calc(28px+env(safe-area-inset-top))] pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-6">
        <span className="flex size-16 items-center justify-center rounded-[22px] bg-gold/14 text-gold">
          <Icon name="pause_circle" size={34} />
        </span>
        <Headline as="h1" text="Your account is " accent="paused" accentColor="gold" size={28} className="mt-4" />
        <p className="type-body mt-2 text-[14.5px] leading-[1.55] text-text2">
          A few people reported your recent calls, so matching is off for a while. Your chats and friends still work.
        </p>

        <div role="timer" aria-label={`Back in ${pausedFor(left)}`} className="mt-5 flex items-center gap-3 rounded-[20px] border border-gold/30 bg-gold/8 px-4 py-3.5">
          <Icon name="schedule" size={22} className="text-gold" />
          <span className="flex-1">
            <span className="type-label block text-[12px] text-text2">Matching is back in</span>
            <span className="type-number-lg block text-[26px] leading-tight text-gold">{pausedFor(left)}</span>
          </span>
        </div>

        <h2 className="type-title mt-6 text-[15px] font-bold">So it doesn&apos;t happen again</h2>
        <ul className="mt-2.5 flex flex-col gap-2">
          {RULES.map((r) => (
            <li key={r.text} className="flex items-center gap-3 rounded-[16px] bg-surface px-3.5 py-3">
              <Icon name={r.icon} size={20} className="text-lavender" />
              <span className="type-body text-[14px]">{r.text}</span>
            </li>
          ))}
        </ul>

        <div className="min-h-6 flex-1" />
        <Link href="/chats" className="bg-brand type-title mt-6 flex h-[54px] items-center justify-center gap-2 rounded-full text-[15.5px] font-bold text-white">
          <Icon name="chat_bubble" size={20} />
          Go to my chats
        </Link>
        <div className="mt-2 text-center" aria-live="polite">
          {appeal === null ? (
            <TextButton className="w-full text-text2" onClick={() => void tellUs()}>
              Think this is a mistake? Tell us
            </TextButton>
          ) : appeal === "OPEN" ? (
            <p className="type-body flex items-center justify-center gap-1.5 py-3 text-[13px] text-text2">
              <Icon name="mark_email_read" size={17} className="text-ok" />
              We got your message — a person will look at it soon.
            </p>
          ) : appeal === "REJECTED" ? (
            <p className="type-body py-3 text-[13px] text-text2">We looked again, and the pause stays this time.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Resolves true once the appeal is sent. */
export const openAppealSheet = () => openSheet<boolean>((close) => <AppealSheet onClose={close} />);

function AppealSheet({ onClose }: { onClose: (sent?: boolean) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = text.trim().length >= 10;
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/me/appeal", { message: text.trim() });
      toast("Thanks — we'll look at it");
      onClose(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFLICT") return onClose(true);
      setError(e instanceof ApiError ? e.message : "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <h2 className="type-title-lg text-[22px] leading-[1.2]">Tell us what happened</h2>
      <p className="type-body mt-1.5 text-[14px] leading-[1.5] text-text2">A real person on our team reads every message. If we got it wrong, we&apos;ll lift the pause.</p>
      <TextArea
        className="mt-4"
        rows={5}
        maxLength={1000}
        showCount
        value={text}
        error={error}
        placeholder="For example: I was only saying hi, I think someone reported me by mistake."
        onChange={(e) => setText(e.target.value)}
        aria-label="What happened"
      />
      <GradientButton label="Send" icon="send" className="mt-4" busy={busy} disabled={!ready} onClick={() => void send()} />
      <TextButton className="mt-1 w-full text-text2" onClick={() => onClose(false)}>
        Cancel
      </TextButton>
    </div>
  );
}
