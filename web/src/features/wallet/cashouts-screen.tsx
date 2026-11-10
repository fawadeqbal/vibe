"use client";

import { useRouter } from "next/navigation";

import { Screen } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { GroupCard } from "@/components/ui/panel";
import { asList, asMap } from "@/lib/api/mappers";
import { parseCashout } from "@/lib/payments";
import { usePaged } from "@/lib/use-paged";
import { api } from "@/stores/services";

import { CashoutRow } from "./cashout-screen";
import { PageFooter } from "./history";

/** Cash out → Cash-outs → See all: every cash-out, newest first, a page at a time. */
export function CashoutsScreen() {
  const router = useRouter();
  const list = usePaged("cashouts", async (cursor) => {
    const page = asMap(await api.get("/wallet/cashout-history", { limit: 30, ...(cursor ? { cursor } : {}) }));
    return { items: asList(page.items).map((c) => parseCashout(asMap(c))), nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null };
  });
  return (
    <Screen header={<AppBar title="Cash-outs" onBack={() => (history.length > 1 ? router.back() : router.push("/wallet/cashout"))} />}>
      {list.done && !list.items.length ? (
        <EmptyState icon="payments" title="No cash-outs yet" body="When you cash out gems, each one shows here with where it is." />
      ) : list.items.length ? (
        <GroupCard>
          {list.items.map((c) => (
            <CashoutRow key={c.id} c={c} />
          ))}
        </GroupCard>
      ) : null}
      <PageFooter loading={list.loading} failed={list.failed} retry={list.retry} sentinel={list.sentinel} />
    </Screen>
  );
}
