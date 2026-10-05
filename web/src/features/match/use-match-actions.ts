"use client";

import { useCallback, useMemo } from "react";

import { confirm, useNeedCoins } from "@/components/shared/dialogs";
import { pickGift } from "@/components/shared/gift-sheet";
import { pickReport } from "@/components/shared/report-sheet";
import { errorMessage } from "@/lib/api/errors";
import type { Gift } from "@/lib/models";
import { economy } from "@/stores/catalog";
import { cooldownSeconds, useMatch } from "@/stores/match";
import { toast } from "@/stores/ui";
import { filterCost, freeFriendRequestsLeft, isBoosted, isVip, useWallet } from "@/stores/wallet";

/**
 * Every tap on the match screen that can cost coins or needs a question
 * first (the Flutter `_MatchScreenState` handlers). `onGiftSent` lets the
 * screen play the gift burst.
 */
export function useMatchActions(onGiftSent: (g: Gift) => void) {
  const needCoins = useNeedCoins();

  /** After a failed action: coins → offer the store; anything else → toast. */
  const explainFailure = useCallback(
    async (coinsWhy: string) => {
      const m = useMatch.getState();
      if (m.needsCoins) await needCoins(coinsWhy);
      else if (m.lastError) toast(m.lastError, { error: true });
    },
    [needCoins],
  );

  const currentFilterCost = () => filterCost(useMatch.getState().filters, isVip(useWallet.getState().wallet));

  const start = useCallback(async () => {
    if (!(await useMatch.getState().start())) await explainFailure(`These filters cost ${currentFilterCost()} coins per match.`);
  }, [explainFailure]);

  const next = useCallback(async () => {
    const bypass = economy().skipCooldownBypassCost;
    // The server can answer "slow down" — then offer the same choice as a local cooldown.
    for (let attempt = 0; attempt < 2; attempt++) {
      const m = useMatch.getState();
      if (cooldownSeconds(m) > 0) {
        const pay = await confirm({
          title: "Slow down a second",
          body: `Five quick skips in a row. Wait ${cooldownSeconds(m)}s, or skip now for ${bypass} coins.`,
          cancel: "Wait",
          ok: `Skip for ${bypass}`,
        });
        if (!pay) return;
        if (!(await useMatch.getState().next(true))) await explainFailure(`Skipping the cooldown costs ${bypass} coins.`);
        return;
      }
      if (await m.next()) return;
      if (cooldownSeconds(useMatch.getState()) === 0) break;
    }
    await explainFailure(`These filters cost ${currentFilterCost()} coins per match.`);
  }, [explainFailure]);

  const gift = useCallback(async () => {
    const p = useMatch.getState().partner;
    if (!p) return;
    const g = await pickGift(p.name);
    if (!g) return;
    if (await useMatch.getState().sendGift(g)) return onGiftSent(g);
    const m = useMatch.getState();
    if (m.lastError && !m.needsCoins) toast(m.lastError, { error: true });
    else await needCoins(`A ${g.name} costs ${g.coins} coins.`);
  }, [needCoins, onGiftSent]);

  const addFriend = useCallback(async () => {
    const e = economy();
    if (freeFriendRequestsLeft(useWallet.getState()) === 0) {
      const ok = await confirm({
        title: "Send a friend request?",
        body: `Your ${e.freeFriendRequestsPerDay} free requests for today are used. This one costs ${e.friendRequestCost} coins.`,
        ok: `Send for ${e.friendRequestCost}`,
      });
      if (!ok) return;
    }
    if (!(await useMatch.getState().addFriend())) await needCoins(`A friend request costs ${e.friendRequestCost} coins once your free ones are used.`);
    else toast("Request sent");
  }, [needCoins]);

  const report = useCallback(async () => {
    const p = useMatch.getState().partner;
    if (!p) return;
    const choice = await pickReport(p.name);
    if (!choice) return;
    try {
      await useMatch.getState().report(choice.reason, choice);
      toast(`Thanks. ${p.name} was reported${choice.block ? " and blocked" : ""}.`);
    } catch (e) {
      toast(errorMessage(e), { error: true });
    }
  }, []);

  const reportLast = useCallback(async () => {
    const p = useMatch.getState().lastPartner;
    if (!p) return;
    const choice = await pickReport(p.name, true);
    if (!choice) return;
    try {
      await useMatch.getState().reportLast(choice.reason, choice);
      toast(`Thanks. ${p.name} was reported${choice.block ? " and blocked" : ""}.`);
    } catch (e) {
      toast(errorMessage(e), { error: true });
    }
  }, []);

  const reconnect = useCallback(async () => {
    if (!(await useMatch.getState().reconnect())) await explainFailure(`Reconnecting costs ${economy().reconnectCost} coins.`);
  }, [explainFailure]);

  return useMemo(() => ({ start, next, gift, addFriend, report, reportLast, reconnect }), [start, next, gift, addFriend, report, reportLast, reconnect]);
}

/** Asks before spending on a boost; shared by the lobby and the search. */
export async function confirmBoost() {
  const w = useWallet.getState();
  if (isBoosted(w.wallet)) return;
  const e = economy();
  const ok = await confirm({
    title: `Boost for ${e.boostMinutes} minutes?`,
    body: `You go to the front of the queue — faster matches, more of them. ${e.boostCost} coins.`,
    ok: `Boost · ${e.boostCost}`,
    cancel: "Not now",
    okTone: "gold",
  });
  if (!ok) return;
  try {
    if (!(await w.boost())) toast("Not enough coins for a boost", { error: true });
  } catch (err) {
    toast(errorMessage(err), { error: true });
  }
}
