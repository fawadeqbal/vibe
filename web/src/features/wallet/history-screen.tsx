"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Screen } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { PillTabs } from "@/components/ui/tabs";
import { asList, asMap, transaction } from "@/lib/api/mappers";
import { usePaged } from "@/lib/use-paged";
import { api } from "@/stores/services";

import { HistoryDays, PageFooter } from "./history";

type Tab = "all" | "coins" | "gems";

/** Wallet → History → See all: every coin and gem move, by day, a page at a time as you scroll. */
export function HistoryScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const list = usePaged(tab, async (cursor) => {
    const page = asMap(await api.get("/wallet/transactions", { limit: 30, ...(cursor ? { cursor } : {}), ...(tab === "all" ? {} : { currency: tab }) }));
    return { items: asList(page.items).map((e) => transaction(asMap(e))), nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null };
  });
  return (
    <Screen
      width="wide"
      header={<AppBar title="History" onBack={() => (history.length > 1 ? router.back() : router.push("/wallet"))} />}
      pinned={
        <PillTabs
          label="Show"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "all", label: "All" },
            { value: "coins", label: "Coins" },
            { value: "gems", label: "Gems" },
          ]}
        />
      }
    >
      {list.done && !list.items.length ? (
        <EmptyState icon="receipt_long" title="Nothing yet" body="Purchases, gifts, rewards and spends all show up here." />
      ) : (
        <HistoryDays items={list.items} />
      )}
      <PageFooter loading={list.loading} failed={list.failed} retry={list.retry} sentinel={list.sentinel} />
    </Screen>
  );
}
