"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { confirm, useNeedCoins } from "@/components/shared/dialogs";
import { pickGift } from "@/components/shared/gift-sheet";
import { pickReport } from "@/components/shared/report-sheet";
import { errorMessage } from "@/lib/api/errors";
import type { Gift } from "@/lib/models";
import { freeReconnectLeft } from "@/lib/engagement";
import { economy } from "@/stores/catalog";
import { cooldownSeconds, useMatch } from "@/stores/match";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";
import { useFilters } from "@/stores/filters";
import { freeFriendRequestsLeft, isBoosted, useWallet } from "@/stores/wallet";

import { openFilterPass } from "@/features/filters/filters-sheet";

import { openCooldown } from "./match-sheets";

/**
 * Every tap on the match screen that can cost coins or needs a question
 * first (the Flutter `_MatchScreenState` handlers). `onGiftSent` lets the
 * screen play the gift burst.
 */
export function useMatchActions(onGiftSent: (g: Gift) => void) {
  const needCoins = useNeedCoins();
  const router = useRouter();

  /** After a failed action: coins → offer the store; anything else → toast. */
  const explainFailure = useCallback(
    async (coinsWhy: string) => {
      const m = useMatch.getState();
      if (m.needsCoins) await needCoins(coinsWhy);
      else if (m.lastError) toast(m.lastError, { error: true });
    },
    [needCoins],
  );

  /**
   * Gender or country are on but not open: the filter pass (shared with Discover), VIP, or
   * meet anyone for now (age and verified only still apply). True = start again.
   */
  const filtersLocked = useCallback(async (): Promise<boolean> => {
    const r = await openFilterPass();
    if (r === "ok") return true;
    if (r === "vip") router.push("/vip");
    else if (r === "coins") router.push("/store");
    else {
      const f = useFilters.getState().filters;
      await useFilters.getState().save({ ...f, gender: "anyone", countryCode: null });
      return true;
    }
    return false;
  }, [router]);

  const start = useCallback(async () => {
    if (await useMatch.getState().start()) return;
    if (useMatch.getState().filtersLocked) {
      if (await filtersLocked()) await useMatch.getState().start();
      return;
    }
    await explainFailure("You need more coins for that.");
  }, [explainFailure, filtersLocked]);

  const next = useCallback(async () => {
    const bypass = economy().skipCooldownBypassCost;
    // The server can answer "slow down" — then offer the same choice as a local cooldown.
    for (let attempt = 0; attempt < 2; attempt++) {
      const m = useMatch.getState();
      if (cooldownSeconds(m) > 0 && m.cooldownUntil) {
        const choice = await openCooldown({ until: m.cooldownUntil, bypassCost: bypass, skipped: economy().skipsBeforeCooldown });
        if (!choice || useMatch.getState().status !== "connected") return;
        if (choice === "next") {
          // The wait is over: carry on to the next person.
          if (!(await useMatch.getState().next())) await explainFailure("You need more coins for that.");
          return;
        }
        if (!(await useMatch.getState().next(true))) await explainFailure(`Skipping the cooldown costs ${bypass} coins.`);
        return;
      }
      if (await m.next()) return;
      if (cooldownSeconds(useMatch.getState()) === 0) break;
    }
    await explainFailure("You need more coins for that.");
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

  /** After a skip: a friend request to the person you just left. */
  const addLastFriend = useCallback(async () => {
    const p = useMatch.getState().lastPartner;
    if (!p) return;
    const e = economy();
    if (freeFriendRequestsLeft(useWallet.getState()) === 0) {
      const ok = await confirm({
        title: `Send ${p.name} a friend request?`,
        body: `Your ${e.freeFriendRequestsPerDay} free requests for today are used. This one costs ${e.friendRequestCost} coins.`,
        ok: `Send for ${e.friendRequestCost}`,
      });
      if (!ok) return;
    }
    try {
      if (await useSocial.getState().sendRequest(p)) toast(`Request sent to ${p.name}`);
      else await needCoins(`A friend request costs ${e.friendRequestCost} coins once your free ones are used.`);
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
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
    const ended = useMatch.getState().ended;
    const cost = ended?.reconnectCost ?? economy().reconnectCost;
    if (!(await useMatch.getState().reconnect())) await explainFailure(freeReconnectLeft(ended?.freeReconnectUntil ?? null) > 0 ? "Reconnecting is free right now — try again." : `Reconnecting costs ${cost} coins.`);
  }, [explainFailure]);

  return useMemo(() => ({ start, next, gift, addFriend, addLastFriend, report, reportLast, reconnect }), [start, next, gift, addFriend, addLastFriend, report, reportLast, reconnect]);
}

/** Asks before spending on a boost (or using a free one); shared by the lobby and the search. */
export async function confirmBoost() {
  const w = useWallet.getState();
  if (isBoosted(w.wallet)) return;
  const e = economy();
  const free = w.wallet.freeBoosts > 0;
  const ok = await confirm({
    title: free ? `Use your free ${e.boostMinutes}-minute boost?` : `Boost for ${e.boostMinutes} minutes?`,
    body: `You go to the front of the queue — faster matches, more of them. ${free ? "This one's on us." : `${e.boostCost} coins.`}`,
    ok: free ? "Boost · Free" : `Boost · ${e.boostCost}`,
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
