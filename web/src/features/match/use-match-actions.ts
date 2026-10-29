"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { confirm, useNeedCoins } from "@/components/shared/dialogs";
import { pickGift } from "@/components/shared/gift-sheet";
import { pickReport } from "@/components/shared/report-sheet";
import { rewardedAds } from "@/components/shared/rewarded-ads";
import { errorMessage } from "@/lib/api/errors";
import type { Gift } from "@/lib/models";
import { COUNTRIES } from "@/lib/catalog";
import { freeReconnectLeft } from "@/lib/engagement";
import { economy } from "@/stores/catalog";
import { isVibeHour, useEngagement } from "@/stores/engagement";
import { cooldownSeconds, useMatch } from "@/stores/match";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";
import { filterCost, freeFriendRequestsLeft, isBoosted, isVip, useWallet } from "@/stores/wallet";

import { openCooldown, openFilterCoins } from "./match-sheets";

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

  const currentFilterCost = () => filterCost(useMatch.getState().filters, isVip(useWallet.getState().wallet) || isVibeHour(useEngagement.getState()));

  /**
   * Filters they can't afford: get coins, watch a video, VIP, or match with
   * anyone for free (which starts right away).
   */
  const filtersNeedCoins = useCallback(async (): Promise<boolean> => {
    const f = useMatch.getState().filters;
    const label = [f.gender === "women" ? "Women" : f.gender === "men" ? "Men" : null, f.countryCode ? (COUNTRIES.find((c) => c.code === f.countryCode)?.name ?? f.countryCode) : null]
      .filter(Boolean)
      .join(" · ");
    const choice = await openFilterCoins({ cost: currentFilterCost(), coins: useWallet.getState().wallet.coins, filterLabel: label || "Filters" });
    if (choice === "store") router.push("/store");
    else if (choice === "vip") router.push("/vip");
    else if (choice === "ad") {
      const r = await rewardedAds.show();
      if (r.outcome === "rewarded" && r.token) {
        const coins = await useWallet.getState().rewardAd(r.token).catch(() => null);
        toast(coins == null ? "Daily ad limit reached" : `+${coins} coins — tap Start again`, { error: coins == null });
      } else if (r.outcome !== "dismissed") toast(r.message ?? "No video right now. Try again in a minute.", { error: true });
    } else if (choice === "anyone") {
      useMatch.getState().setFilters({ ...f, gender: "anyone", countryCode: null });
      return true;
    }
    return false;
  }, [router]);

  const start = useCallback(async () => {
    if (await useMatch.getState().start()) return;
    if (useMatch.getState().needsCoins) {
      if (await filtersNeedCoins()) await useMatch.getState().start();
      return;
    }
    await explainFailure(`These filters cost ${currentFilterCost()} coins per match.`);
  }, [explainFailure, filtersNeedCoins]);

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
          if (!(await useMatch.getState().next())) await explainFailure(`These filters cost ${currentFilterCost()} coins per match.`);
          return;
        }
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
