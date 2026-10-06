"use client";

import { useState } from "react";

import { Glass } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { alpha } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { GAMES, gameTitle } from "@/lib/engagement";
import type { CallGame, GameId } from "@/lib/models";
import { useMatch } from "@/stores/match";
import { openSheet, toast } from "@/stores/ui";

/** "Play" in the call controls: pick one of the three icebreakers. */
export const openGamePicker = () => openSheet<GameId>((close) => <GamePicker onPick={close} />);

function GamePicker({ onPick }: { onPick: (g: GameId) => void }) {
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <h2 className="type-title-lg text-[20px]">Play a game</h2>
      <p className="type-body mt-1 text-[13px] text-text2">An icebreaker for both of you. Either of you can skip or close it.</p>
      <GroupCard className="mt-4">
        {GAMES.map((g) => (
          <GroupRow key={g.id} icon={g.icon} iconColor="lavender" iconBg={alpha("violet", 0.16)} title={g.title} subtitle={g.blurb} trailing={<Icon name="chevron_right" className="text-muted" />} onClick={() => onPick(g.id)} />
        ))}
      </GroupCard>
    </div>
  );
}

/** Shows a game failure (a quick double "Next" is RATE_LIMITED; a stale round is CONFLICT). */
export function gameError(e: unknown) {
  if (e instanceof ApiError && (e.code === "RATE_LIMITED" || e.code === "CONFLICT")) return;
  toast(errorMessage(e), { error: true });
}

/**
 * The prompt over the video, above the chat: two option pills (or "We
 * answered" for an open question), then both choices once you both picked.
 */
export function GameCard({ game, partnerName }: { game: CallGame; partnerName: string }) {
  const [busy, setBusy] = useState(false);
  const m = useMatch.getState();
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      gameError(e);
    } finally {
      setBusy(false);
    }
  };
  const same = game.revealed && game.options && game.mine === game.theirs && game.mine != null && game.mine >= 0;
  const status = game.revealed
    ? game.options
      ? same
        ? `You both picked ${game.options[game.mine!]}!`
        : `You picked differently — talk it out`
      : "You both answered"
    : game.mine != null
      ? game.partnerAnswered
        ? "Revealing…"
        : `Waiting for ${partnerName}…`
      : game.partnerAnswered
        ? `${partnerName} answered — your turn`
        : game.by === "partner"
          ? `${partnerName} started a game`
          : null;

  return (
    <Glass radius={22} className="border-white/14 bg-bg2/62 px-4 pt-3 pb-3.5" style={{ animation: "vibe-dialog-in 180ms ease-out" }}>
      <div className="flex items-center">
        <Icon name="casino" size={16} className="text-lavender" />
        <span className="type-overline ml-1.5 flex-1 truncate text-[10.5px] text-lavender">
          {gameTitle(game.game)} · {game.round}
        </span>
        <button type="button" aria-label="Close game" onClick={() => void m.closeGame()} className="-mr-1.5 flex size-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10">
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="type-title mt-1 text-[17px] leading-[1.3] text-white" aria-live="polite">
        {game.text}
      </p>
      {game.options ? (
        <div className="mt-3 flex gap-2">
          {game.options.map((o, i) => (
            <OptionPill key={i} label={o} mine={game.mine === i} theirs={game.revealed && game.theirs === i} partnerName={partnerName} disabled={game.mine != null || busy} onClick={() => void run(() => m.answerGame(i as 0 | 1))} />
          ))}
        </div>
      ) : (
        <button
          type="button"
          disabled={game.mine != null || busy}
          onClick={() => void run(() => m.answerGame())}
          className={cn(
            "type-label mt-3 flex h-10 w-full items-center justify-center rounded-full border text-[13.5px] transition-colors",
            game.mine != null ? "border-ok/50 bg-ok/14 text-ok" : "border-white/18 bg-white/10 text-white hover:bg-white/16",
          )}
        >
          <Icon name={game.mine != null ? "check" : "record_voice_over"} size={17} className="mr-1.5" />
          {game.mine != null ? "Answered" : "I answered"}
        </button>
      )}
      <div className="mt-2.5 flex min-h-8 items-center">
        <span className={cn("type-body min-w-0 flex-1 truncate text-[12.5px]", same ? "font-semibold text-pink-soft" : "text-white/72")}>{status}</span>
        <button type="button" disabled={busy} onClick={() => void run(m.nextGame)} className="type-label flex h-8 shrink-0 items-center rounded-full bg-white/12 pr-2.5 pl-3 text-[12.5px] text-white transition-colors hover:bg-white/18">
          Next
          <Icon name="arrow_forward" size={15} className="ml-1" />
        </button>
      </div>
    </Glass>
  );
}

function OptionPill({ label, mine, theirs, partnerName, disabled, onClick }: { label: string; mine: boolean; theirs: boolean; partnerName: string; disabled: boolean; onClick: () => void }) {
  const tags = [mine ? "You" : null, theirs ? partnerName : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={mine}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-[18px] border px-3 py-2 text-center transition-colors",
        mine ? "border-pink/70 bg-pink/22" : theirs ? "border-violet/70 bg-violet/24" : "border-white/18 bg-white/10",
        !disabled && "hover:bg-white/16",
      )}
    >
      <span className="type-label text-[13.5px] leading-[1.25] text-white">{label}</span>
      {tags ? <span className="type-label mt-0.5 truncate text-[10.5px] text-white/75">{tags}</span> : null}
    </button>
  );
}
