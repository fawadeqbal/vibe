"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { startSelfieVerification } from "@/components/shared/selfie-verification";
import { Avatar } from "@/components/ui/avatar";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { asList, asMap } from "@/lib/api/mappers";
import { alpha, color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { date, figure, thousands, time, until } from "@/lib/format";
import { openAppealSheet } from "@/features/match/account-paused";
import { api } from "@/stores/services";
import { useSession } from "@/stores/session";
import { useEngagement } from "@/stores/engagement";
import { toast } from "@/stores/ui";

import { DetailActions, DetailError, DetailGone, DetailHero, DetailLoading, DetailPage, SectionLabel, StatusTag, useDetail } from "./detail-kit";

const stamp = (d: Date) => `${date(d)}, ${time(d)}`;

interface AccountNote {
  id: string;
  type: string;
  title: string;
  body: string;
  at: Date;
}

interface AccountStatus {
  pausedUntil: Date | null;
  appeal: { status: "OPEN" | "ACCEPTED" | "REJECTED"; createdAt: Date | null } | null;
  notes: AccountNote[];
}

const parseStatus = (raw: unknown): AccountStatus => {
  const m = asMap(raw);
  const appeal = m.appeal ? asMap(m.appeal) : null;
  return {
    pausedUntil: typeof m.pausedUntil === "string" ? new Date(m.pausedUntil) : null,
    appeal: appeal
      ? {
          status: (appeal.status as "OPEN" | "ACCEPTED" | "REJECTED") ?? "OPEN",
          createdAt: typeof appeal.createdAt === "string" ? new Date(appeal.createdAt) : null,
        }
      : null,
    notes: asList(m.notes).map((x) => {
      const n = asMap(x);
      return {
        id: String(n.id ?? ""),
        type: String(n.type ?? ""),
        title: String(n.title ?? ""),
        body: String(n.body ?? ""),
        at: new Date(String(n.createdAt ?? "")),
      };
    }),
  };
};

const NOTE_ICON: Record<string, string> = { "account.warning": "warning_amber", "account.paused": "pause_circle", "account.appeal": "outlined_flag" };

/**
 * Account status: whether matching is paused (until when, appeal), and every
 * note the Vibe team sent about your account. `note` highlights the one a
 * notification was about.
 */
export function AccountStatusView({ note }: { note?: string }) {
  const router = useRouter();
  const [v, setV] = useState(0);
  const { data: s, error } = useDetail(async () => parseStatus(await api.get("/me/status")), [v]);
  useEffect(() => {
    if (!s || !note) return;
    document.getElementById(`note-${note}`)?.scrollIntoView({ block: "center" });
  }, [s, note]);
  if (!s) return <DetailPage title="Account status">{error ? <DetailError /> : <DetailLoading />}</DetailPage>;

  const appeal = async () => {
    if (await openAppealSheet()) setV((x) => x + 1);
  };
  return (
    <DetailPage title="Account status">
      {s.pausedUntil ? (
        <section className="mt-2 rounded-[22px] border border-warn/25 bg-warn/8 p-[18px]">
          <div className="flex items-center gap-2.5">
            <Icon name="pause_circle" size={26} className="text-warn" />
            <h2 className="type-title flex-1 text-[17px]">Matching is paused</h2>
            <StatusTag text={until(s.pausedUntil)} tone="warn" />
          </div>
          <p className="type-body mt-2.5 text-[13.5px] leading-[1.5] text-text2">
            People reported your recent calls, so random matching is off until <b className="font-bold text-text">{stamp(s.pausedUntil)}</b>. Your chats,
            friends and Discover still work.
          </p>
          <div className="mt-3.5 flex gap-2">
            {!s.appeal ? (
              <GradientButton
                label="Appeal"
                icon="outlined_flag"
                height={36}
                expand={false}
                className="px-4 [&>span]:text-[13.5px]"
                onClick={() => void appeal()}
              />
            ) : null}
            <GhostButton label="Guidelines" height={36} className="px-4 [&>span]:text-[13.5px]" onClick={() => router.push("/me/legal")} />
          </div>
        </section>
      ) : (
        <section className="mt-2 flex items-center gap-3 rounded-[22px] border border-ok/22 bg-ok/8 p-[18px]">
          <Icon name="verified_user" size={26} className="text-ok" />
          <span className="min-w-0 flex-1">
            <span className="type-title block text-[16px]">Your account is in good standing</span>
            <span className="type-body mt-0.5 block text-[13px] text-text2">You can match, chat and call as usual.</span>
          </span>
        </section>
      )}
      {s.appeal && s.pausedUntil ? (
        <div className="mt-2.5 flex items-center gap-2.5 rounded-[18px] border border-line bg-surface px-3.5 py-3">
          <Icon name="schedule" variant="outlined" size={20} className="text-info" />
          <span className="type-body flex-1 text-[13px] text-text2">
            <b className="font-bold text-text">Appeal sent</b>
            {s.appeal.createdAt ? ` ${date(s.appeal.createdAt)}` : ""} · we answer within 24 hours
          </span>
        </div>
      ) : null}
      <SectionLabel text="From the Vibe team" />
      {s.notes.length ? (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-[22px] border border-line bg-surface">
          {s.notes.map((n) => {
            const on = n.id === note;
            return (
              <li key={n.id} id={`note-${n.id}`} className={cn("flex gap-3 px-4 py-3.5", on && "bg-warn/7 shadow-[inset_3px_0_0_var(--color-warn)]")}>
                <span
                  className="grid size-[42px] shrink-0 place-items-center rounded-[14px] border"
                  style={{ backgroundColor: alpha(on ? "warn" : "text2", 0.12), borderColor: alpha(on ? "warn" : "text2", 0.2) }}
                >
                  <Icon name={NOTE_ICON[n.type] ?? "info_outline"} variant="outlined" size={21} style={{ color: color(on ? "warn" : "text2") }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="type-title block text-[14px]">{n.title}</span>
                  <span className="type-body mt-0.5 block text-[13px] leading-[1.45] text-text2">
                    {date(n.at)} · {n.body}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="type-body rounded-[22px] border border-line bg-surface px-4 py-5 text-center text-[13.5px] text-muted">No notes. Nice.</p>
      )}
      <p className="type-body mt-3.5 px-2 text-[12px] leading-[1.5] text-muted">Notes stay here for 90 days.</p>
    </DetailPage>
  );
}

/** Your selfie verification: verified, not this time (try again), checking, or not yet. */
export function VerificationView() {
  const router = useRouter();
  const me = useSession((s) => s.me);
  const v = useSession((s) => s.verificationState);
  useEffect(() => {
    void useSession.getState().loadVerification();
  }, []);
  const verified = !!me?.verified || v.status === "approved";
  const retry = async () => {
    const r = await startSelfieVerification();
    if (r?.status === "approved") toast("You’re verified ✅");
  };
  const hero = verified
    ? { icon: "verified", tone: "info" as Tone, title: "You’re verified", sub: "Your selfie matched your photos." }
    : v.status === "rejected"
      ? { icon: "error_outline", tone: "bad" as Tone, title: "We couldn’t verify your selfie", sub: v.reason ?? "Try again in good light, facing the camera." }
      : v.status === "pending"
        ? { icon: "schedule", tone: "info" as Tone, title: "Checking your selfie", sub: "This usually takes a minute." }
        : { icon: "verified_user", tone: "text2" as Tone, title: "Not verified yet", sub: "A quick selfie shows people you’re really you." };
  return (
    <DetailPage
      title="Verification"
      footer={
        <DetailActions>
          {verified ? (
            <GradientButton label="See your profile" icon="person" onClick={() => router.push("/me")} />
          ) : v.status !== "pending" ? (
            <GradientButton label={v.status === "rejected" ? "Try again" : "Verify with a selfie"} icon="photo_camera_front" onClick={() => void retry()} />
          ) : null}
        </DetailActions>
      }
    >
      <DetailHero icon={hero.icon} tone={hero.tone} title={hero.title} sub={hero.sub} />
      {me ? (
        <div className="mt-[18px] flex items-center gap-3.5 rounded-[22px] border border-line bg-surface p-4">
          <Avatar url={me.avatarUrl} name={me.name} size={56} ring />
          <span className="min-w-0 flex-1">
            <span className="type-title flex items-center gap-1.5 text-[17px]">
              {me.name}, {me.age}
              {verified ? <Icon name="verified" size={19} className="text-info" label="Verified" /> : null}
            </span>
            <span className="type-body mt-0.5 block text-[12.5px] text-text2">This is how people see you</span>
          </span>
        </div>
      ) : null}
      <ul className="mt-3 rounded-[22px] border border-line bg-surface py-1">
        {[
          ["verified", "info", "The badge on your profile", "People see you’re really you."],
          ["verified_user", "ok", "Safe mode matches", "You can match with people who only meet verified people."],
          ["shield", "lavender", "Your selfie stays private", "We use it to check, then delete it."],
        ].map(([icon, tone, title, sub]) => (
          <li key={title} className="flex gap-3 px-4 py-3">
            <Icon name={icon} size={22} style={{ color: color(tone as Tone) }} />
            <span>
              <span className="type-title block text-[14px]">{title}</span>
              <span className="type-body mt-0.5 block text-[12.5px] text-text2">{sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </DetailPage>
  );
}

interface TeamMessage {
  id: string;
  title: string;
  body: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  read: boolean;
  at: Date;
}

/** A message from the Vibe team, on its own page. */
export function TeamMessageView({ id }: { id: string }) {
  const {
    data: m,
    gone,
    error,
  } = useDetail(async (): Promise<TeamMessage> => {
    const r = asMap(await api.get(`/inbox/${encodeURIComponent(id)}`));
    return {
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      body: String(r.body ?? ""),
      buttonLabel: typeof r.buttonLabel === "string" ? r.buttonLabel : null,
      buttonUrl: typeof r.buttonUrl === "string" ? r.buttonUrl : null,
      read: !!r.read,
      at: new Date(String(r.createdAt ?? "")),
    };
  }, [id]);
  useEffect(() => {
    if (m && !m.read) void api.post(`/inbox/${encodeURIComponent(m.id)}/read`).catch(() => undefined);
  }, [m]);
  if (!m) return <DetailPage title="Vibe team">{gone ? <DetailGone what="message" /> : error ? <DetailError /> : <DetailLoading />}</DetailPage>;
  const internal = m.buttonUrl?.startsWith("/") ?? false;
  return (
    <DetailPage
      title="Vibe team"
      footer={
        m.buttonLabel && m.buttonUrl ? (
          <DetailActions>
            <GradientButton
              label={m.buttonLabel}
              onClick={() => (internal ? (window.location.href = m.buttonUrl!) : window.open(m.buttonUrl!, "_blank", "noopener,noreferrer"))}
            />
          </DetailActions>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3 px-1 pt-1.5">
        <span className="bg-brand grid size-11 shrink-0 place-items-center rounded-[14px] text-[20px] font-extrabold text-white" aria-hidden>
          V
        </span>
        <span>
          <span className="type-title flex items-center gap-1 text-[15px]">
            Vibe <Icon name="verified" size={16} className="text-pink-soft" label="Official" />
          </span>
          <span className="type-body block text-[12.5px] text-muted">Official · {date(m.at)}</span>
        </span>
      </div>
      <h1 className="type-title-lg mt-5 px-1 text-[24px] leading-tight">{m.title}</h1>
      <div className="mt-2.5 flex flex-col gap-3 px-1">
        {m.body.split(/\n{2,}/).map((para, i) => (
          <p key={i} className="type-body text-[15px] leading-[1.6] whitespace-pre-line text-text2">
            {para}
          </p>
        ))}
      </div>
      <p className="type-body mt-8 px-1 text-[12px] text-muted">
        You get these because News from Vibe is on.{" "}
        <a href="/me/notifications" className="text-pink-soft">
          Change
        </a>
      </p>
    </DetailPage>
  );
}

/** Your week on Vibe: last Monday–Sunday in numbers. */
export function WeeklyRecapView() {
  const recap = useEngagement((s) => s.recap);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void useEngagement
      .getState()
      .loadRecap()
      .then(() => setFailed(!useEngagement.getState().recap));
  }, []);
  if (!recap) return <DetailPage title="Your week">{failed ? <DetailGone what="recap" /> : <DetailLoading />}</DetailPage>;
  const range = `${date(recap.weekStart).replace(/ \d{4}$/, "")} – ${date(new Date(recap.weekEnd.getTime() - 1))}`;
  const share = async () => {
    const text = `My week on Vibe: ${thousands(recap.likesReceived)} likes, ${thousands(recap.giftsReceived)} gifts, ${thousands(recap.newFollowers)} new followers.`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied");
      }
    } catch {}
  };
  const tiles: [string, Tone, string, string][] = [
    ["redeem", "gold", thousands(recap.giftsReceived), "gifts"],
    ["diamond", "gem", `+${figure(recap.gemsEarned)}`, "gems"],
    ["person_add_alt_1", "lavender", thousands(recap.newFollowers), "followers"],
    ["favorite", "pink", thousands(recap.matches), "matches"],
  ];
  return (
    <DetailPage
      title="Your week"
      footer={
        <DetailActions>
          <GradientButton label="Share my week" icon="ios_share" onClick={() => void share()} />
        </DetailActions>
      }
    >
      <section
        className="mt-1 rounded-[24px] border border-white/10 p-5"
        style={{ backgroundImage: "linear-gradient(135deg, rgb(255 61 143 / .22), rgb(139 92 246 / .22))" }}
      >
        <span className="type-label block text-[12.5px] text-text2">{range}</span>
        <span className="type-number mt-1.5 block text-[44px] leading-none font-extrabold tracking-[-1.6px]">
          {figure(recap.likesReceived)} <span className="text-[18px] font-semibold tracking-normal">likes</span>
        </span>
        <span className="type-body mt-2 block text-[13.5px]">
          {recap.bestStreak > 0 ? `Your best streak was ${recap.bestStreak} days. ` : ""}Here’s the rest of your week.
        </span>
      </section>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {tiles.map(([icon, tone, big, small]) => (
          <div key={small} className="rounded-[20px] border p-3.5" style={{ backgroundColor: alpha(tone, 0.08), borderColor: alpha(tone, 0.2) }}>
            <Icon name={icon} size={20} style={{ color: color(tone) }} />
            <span className="type-number mt-2 block text-[24px] leading-none font-extrabold tracking-[-0.6px]">{big}</span>
            <span className="type-body mt-1 block text-[12.5px] text-text2">{small}</span>
          </div>
        ))}
      </div>
    </DetailPage>
  );
}
