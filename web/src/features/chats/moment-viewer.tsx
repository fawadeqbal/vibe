"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { confirm } from "@/components/shared/dialogs";
import { pickReport } from "@/components/shared/report-sheet";
import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MenuButton } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { ago, agoShort } from "@/lib/format";
import type { Moment, Profile } from "@/lib/models";
import { useMoments } from "@/stores/moments";
import { openScreen, openSheet, toast } from "@/stores/ui";

/** One person's moments in the viewer. */
export interface Reel {
  author: Profile;
  moments: Moment[];
  own: boolean;
}

/** How long a photo stays before the next one. */
export const MOMENT_MS = 5000;
/** A press shorter than this is a tap (left/right); longer holds the moment. */
const TAP_MS = 250;

/** Full screen: progress per moment, auto-advance, tap left/right, hold to pause. */
export const openMomentViewer = (reels: Reel[], start: number) => openScreen<void>((close) => <MomentViewer reels={reels} start={start} onClose={() => close()} />);

/** Someone's reel opens at their first unseen moment (yours at the first). */
const firstIndex = (r: Reel) => {
  if (r.own) return 0;
  const i = r.moments.findIndex((m) => !m.seen);
  return i < 0 ? 0 : i;
};

function MomentViewer({ reels: initial, start, onClose }: { reels: Reel[]; start: number; onClose: () => void }) {
  const [reels, setReels] = useState(initial);
  const [pos, setPos] = useState(() => ({ reel: start, index: firstIndex(initial[start]) }));
  const [held, setHeld] = useState(false);
  /** A sheet or dialog is open over the viewer. */
  const [away, setAway] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const pressAt = useRef(0);

  const reel = reels[pos.reel];
  const m = reel?.moments[pos.index];
  const paused = held || away || loadedId !== m?.id;

  const go = useCallback(
    (dir: 1 | -1) => {
      setPos((p) => {
        const r = reels[p.reel];
        const i = p.index + dir;
        if (r && i >= 0 && i < r.moments.length) return { reel: p.reel, index: i };
        const nr = p.reel + dir;
        if (nr < 0) return { reel: p.reel, index: 0 };
        if (nr >= reels.length) {
          // Past the last one: done (closing happens outside the state update).
          queueMicrotask(onClose);
          return p;
        }
        return { reel: nr, index: dir > 0 ? firstIndex(reels[nr]) : reels[nr].moments.length - 1 };
      });
    },
    [reels, onClose],
  );

  // Someone else's moment counts as seen once its photo is on screen.
  useEffect(() => {
    if (m && reel && !reel.own && loadedId === m.id) useMoments.getState().markSeen(m);
  }, [m, reel, loadedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (away) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setHeld((h) => !h);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, away]);

  /** Opens something over the viewer with the timer paused. */
  const over = async <T,>(fn: () => Promise<T>) => {
    setAway(true);
    try {
      return await fn();
    } finally {
      setAway(false);
    }
  };

  if (!reel || !m)
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon="photo" title="Nothing here " accent="now" body="This moment is gone." action={<CircleIconButton icon="close" label="Close" onClick={onClose} />} />
      </div>
    );

  const remove = () =>
    over(async () => {
      const ok = await confirm({ title: "Delete this moment?", body: "It disappears for everyone now.", ok: "Delete", okTone: "bad" });
      if (!ok) return;
      try {
        await useMoments.getState().remove(m.id);
        const left = reel.moments.filter((x) => x.id !== m.id);
        if (!left.length) return onClose();
        setReels((rs) => rs.map((r, i) => (i === pos.reel ? { ...r, moments: left } : r)));
        setPos((p) => ({ reel: p.reel, index: Math.min(p.index, left.length - 1) }));
        toast("Moment deleted");
      } catch (e) {
        toast(errorMessage(e), { error: true });
      }
    });

  const report = () =>
    over(async () => {
      const choice = await pickReport(reel.author.name, "moment");
      if (!choice) return;
      try {
        await useMoments.getState().report(m.id, choice);
        toast(`Thanks. ${reel.author.name} was reported${choice.block ? " and blocked" : ""}.`);
        if (choice.block) onClose();
      } catch (e) {
        toast(errorMessage(e), { error: true });
      }
    });

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[520px] flex-col overflow-hidden bg-black select-none">
      {/* The photo; press = hold, tap left/right = back/next. */}
      <div
        className="absolute inset-0"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          pressAt.current = Date.now();
          setHeld(true);
        }}
        onPointerUp={(e) => {
          setHeld(false);
          if (Date.now() - pressAt.current > TAP_MS) return;
          const box = e.currentTarget.getBoundingClientRect();
          go(e.clientX - box.left < box.width / 3 ? -1 : 1);
        }}
        onPointerLeave={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={m.id} src={m.mediaUrl} alt={m.caption || `${reel.author.name}'s moment`} draggable={false} onLoad={() => setLoadedId(m.id)} onError={() => setLoadedId(m.id)} className="size-full object-contain" />
        {loadedId !== m.id ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size={32} className="text-white/80" />
          </span>
        ) : null}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[140px]" style={{ backgroundImage: "linear-gradient(to bottom, rgb(0 0 0 / .6), rgb(0 0 0 / 0))" }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[200px]" style={{ backgroundImage: "linear-gradient(to top, rgb(0 0 0 / .7), rgb(0 0 0 / 0))" }} />

      {/* Progress, author, close. */}
      <div className="relative px-3 pt-[calc(10px+env(safe-area-inset-top))]">
        <div className="flex gap-1">
          {reel.moments.map((x, i) => (
            <span key={x.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              {i < pos.index ? <span className="block size-full bg-white" /> : null}
              {i === pos.index ? (
                <span
                  key={`${x.id}-${pos.reel}`}
                  className="block size-full origin-left bg-white"
                  style={{ animation: `vibe-fill ${MOMENT_MS}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }}
                  onAnimationEnd={() => go(1)}
                />
              ) : null}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center">
          <Avatar url={reel.author.avatarUrl} name={reel.author.name} size={34} />
          <span className="ml-2.5 min-w-0 flex-1">
            <span className="type-title block truncate text-[14px] font-semibold text-white">{reel.own ? "Your moment" : reel.author.name}</span>
            <span className="type-body block text-[11.5px] text-white/70">{agoShort(m.createdAt)}</span>
          </span>
          {held ? <Icon name="pause" size={20} className="mr-1 text-white/80" label="Paused" /> : null}
          {!reel.own ? (
            <MenuButton label="More" icon="more_horiz" items={[{ label: "Report", tone: "bad", onSelect: () => void report() }]} className="[&>button]:text-white" />
          ) : null}
          <CircleIconButton icon="close" label="Close" onClick={onClose} className="ml-1 bg-white/12 text-white" />
        </div>
      </div>

      <div className="flex-1" />

      {/* Caption and, on yours, views and delete. */}
      <div className="relative px-4 pb-[calc(18px+env(safe-area-inset-bottom))]">
        {m.caption ? <p className="type-body mb-3 text-center text-[15px] leading-[1.4] text-white [text-shadow:0_1px_8px_rgb(0_0_0/.6)]">{m.caption}</p> : null}
        {reel.own ? (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => void over(() => openViewersSheet(m))}
              className="flex h-10 items-center rounded-full bg-white/12 px-3.5 text-white backdrop-blur-[16px] transition-colors hover:bg-white/18"
              aria-label="Who saw it"
            >
              <Icon name="visibility" size={18} />
              <span className="type-label ml-1.5 text-[13px]">{m.viewsCount ?? 0}</span>
            </button>
            <CircleIconButton icon="delete_outline" label="Delete moment" onClick={() => void remove()} className="bg-white/12 text-white" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Who saw your moment, newest first. */
const openViewersSheet = (m: Moment) => openSheet<void>(() => <ViewersSheet momentId={m.id} />);

function ViewersSheet({ momentId }: { momentId: string }) {
  const [list, setList] = useState<{ profile: Profile; at: Date }[] | null>(null);
  useEffect(() => {
    let alive = true;
    useMoments
      .getState()
      .viewers(momentId)
      .then(
        (v) => alive && setList(v),
        (e: unknown) => {
          if (!alive) return;
          toast(errorMessage(e), { error: true });
          setList([]);
        },
      );
    return () => {
      alive = false;
    };
  }, [momentId]);
  return (
    <div className="px-5 pt-2.5 pb-5">
      <h2 className="type-title-lg text-[20px]">{list ? `Seen by ${list.length}` : "Seen by"}</h2>
      {list === null ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !list.length ? (
        <p className="type-body py-6 text-[14px] text-text2">Nobody has seen it yet.</p>
      ) : (
        <div className="mt-2">
          {list.map((v, i) => (
            <div key={v.profile.id} className={`flex items-center py-2.5 ${i < list.length - 1 ? "border-b border-line-soft" : ""}`}>
              <Avatar url={v.profile.avatarUrl} name={v.profile.name} size={40} />
              <span className="type-title ml-3 flex-1 truncate text-[15px] font-semibold">{v.profile.name}</span>
              <span className="type-body text-[12px] text-muted">{ago(v.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
