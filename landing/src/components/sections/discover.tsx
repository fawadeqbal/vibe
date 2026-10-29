import Image from "next/image";

import { Cta } from "@/components/cta";
import { Icon } from "@/components/icon";
import type { IconName } from "@/lib/icons";
import { site } from "@/lib/site";

const FEATURES: {
  icon: IconName;
  tint: string;
  title: string;
  body: string;
}[] = [
  {
    icon: "favorite",
    tint: "bg-pink/14 text-pink",
    title: "Like or pass",
    body: "One real person at a time: photo, bio, what you have in common. Likes are free every day.",
  },
  {
    icon: "star",
    tint: "bg-violet/14 text-lavender",
    title: "Super Like",
    body: "Stand out: they see your star and you show up first in their deck.",
  },
  {
    icon: "chat",
    tint: "bg-trust/12 text-trust",
    title: "It's a match",
    body: "Two likes and the chat opens. Say hi with a ready-made opener or your own words.",
  },
  {
    icon: "tune",
    tint: "bg-gold/12 text-gold",
    title: "Filters that matter",
    body: "Age, gender, country, online now, verified only. Free in Vibe Hour and with VIP.",
  },
];

const CONSENT: string[] = [
  "Video calls in chat stay off until you both tap Allow.",
  "Either of you can turn calls off again — any time, no questions.",
  "Missed and finished calls show in the chat, so nothing is a surprise.",
];

/** Discover (swipe, match, chat) and consent-first calls in chat. */
export function Discover() {
  return (
    <section
      id="discover"
      aria-labelledby="discover-title"
      className="relative overflow-hidden border-t border-line-soft"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-[-10%] h-[460px] w-[620px] bg-[radial-gradient(55%_60%_at_50%_40%,rgb(255_61_143/0.1),rgb(11_10_16/0)_70%)]"
      />
      <div className="relative mx-auto grid max-w-[1140px] items-center gap-12 px-4 py-20 sm:px-6 sm:py-[88px] lg:grid-cols-[1fr_380px]">
        <div>
          <p className="eyebrow text-pink">New · Discover</p>
          <h2
            id="discover-title"
            className="mt-3 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-bold tracking-[-0.03em]"
          >
            Not ready for live video?{" "}
            <span className="serif text-pink">Swipe</span> first.
          </h2>
          <p className="mt-3.5 max-w-[560px] text-base leading-[1.6] text-text2">
            Discover shows real, active people near you and around the world.
            Like someone, and if they like you back it&apos;s a match — the chat
            opens and you can take it from there.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="flex gap-3.5 rounded-[20px] border border-line bg-bg2 p-5"
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-[14px] ${f.tint}`}
                >
                  <Icon name={f.icon} size={20} />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold">
                    {f.title}
                  </span>
                  <span className="mt-1 block text-[13.5px] leading-[1.5] text-text2">
                    {f.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-[22px] border border-trust/25 bg-trust/[0.06] p-5">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <Icon name="verified_user" size={20} className="text-trust" />{" "}
              Calls only when you both say yes
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {CONSENT.map((c) => (
                <li
                  key={c}
                  className="flex gap-2 text-[13.5px] leading-[1.5] text-text2"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-trust"
                  />
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Cta href={`${site.links.webApp}/discover`}>Open Discover</Cta>
            <span className="text-[13px] text-muted">
              Free · 18+ · works in your browser
            </span>
          </div>
        </div>

        {/* A swipe card, drawn in CSS: one person, the actions under it. */}
        <div
          aria-hidden="true"
          className="mx-auto w-full max-w-[280px] sm:max-w-[340px]"
        >
          <div className="relative">
            <div className="absolute inset-x-6 top-3 bottom-0 rotate-[-5deg] rounded-[28px] border border-line bg-bg2" />
            <div className="relative aspect-[3/4] overflow-hidden rounded-[28px] border border-line shadow-[0_30px_80px_rgb(0_0_0/0.45)]">
              <Image
                src="/img/sofia.jpg"
                alt=""
                fill
                sizes="340px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgb(0_0_0/0.55)_70%,rgb(0_0_0/0.9))]" />
              <span className="absolute top-4 left-4 inline-flex h-8 items-center gap-1.5 rounded-full bg-violet px-3 text-[12.5px] font-semibold text-white">
                <Icon name="star" size={15} /> Super Liked you
              </span>
              <span className="absolute top-5 right-5 rotate-12 rounded-[10px] border-[3px] border-ok px-3 py-0.5 text-[22px] font-bold tracking-wide text-ok">
                LIKE
              </span>
              <div className="absolute inset-x-5 bottom-5 text-white">
                <p className="text-[28px] font-bold tracking-[-0.02em]">
                  Sofia<span className="font-normal">, 24</span>
                </p>
                <p className="text-[13px] text-white/80">Lisbon · Active now</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Music", "Travel", "Coffee"].map((t, i) => (
                    <span
                      key={t}
                      className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${i === 0 ? "bg-white text-bg" : "bg-white/15"}`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-center gap-4">
            <span className="grid size-14 place-items-center rounded-full border border-line bg-bg2 text-text">
              <Icon name="close" size={26} />
            </span>
            <span className="grid size-12 place-items-center rounded-full border border-violet/40 bg-violet/15 text-lavender">
              <Icon name="star" size={22} />
            </span>
            <span className="bg-brand grid size-16 place-items-center rounded-full text-white shadow-[0_10px_30px_rgb(255_61_143/0.4)]">
              <Icon name="favorite" size={30} />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const DAILY: { icon: IconName; tint: string; title: string; body: string }[] = [
  {
    icon: "local_fire_department",
    tint: "bg-pink/14 text-pink",
    title: "Vibe Hour, every day",
    body: "One hour when every filter is free for everyone and XP is doubled. We'll remind you when it starts.",
  },
  {
    icon: "bolt",
    tint: "bg-gold/12 text-gold",
    title: "Streaks and levels",
    body: "Talk to a friend every day to keep your streak alive. Every call and gift earns XP towards your next level.",
  },
  {
    icon: "emoji_events",
    tint: "bg-violet/14 text-lavender",
    title: "Weekly leaderboard",
    body: "This week's top people by XP and by gifts received. A fresh board every Monday — anyone can make it.",
  },
  {
    icon: "notifications_active",
    tint: "bg-trust/12 text-trust",
    title: "Never miss a like",
    body: "See when someone likes you, matches you or wants to call — and when people are looking to meet right now.",
  },
];

/** Reasons to come back tomorrow. */
export function Daily() {
  return (
    <section
      id="daily"
      aria-labelledby="daily-title"
      className="border-t border-line-soft"
    >
      <div className="mx-auto max-w-[1140px] px-4 py-20 sm:px-6 sm:py-[88px]">
        <p className="eyebrow text-muted">Every day</p>
        <h2
          id="daily-title"
          className="mt-3 text-[clamp(28px,3.6vw,40px)] leading-[1.08] font-bold tracking-[-0.03em]"
        >
          Something to come <span className="serif text-gold">back</span> for
        </h2>
        <ul className="mt-11 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
          {DAILY.map((d) => (
            <li
              key={d.title}
              className="rounded-3xl border border-line bg-bg2 p-6"
            >
              <span
                className={`grid size-11 place-items-center rounded-2xl ${d.tint}`}
              >
                <Icon name={d.icon} size={22} />
              </span>
              <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.3px]">
                {d.title}
              </h3>
              <p className="mt-2 text-sm leading-[1.55] text-text2">{d.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
