"use client";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useCatalog } from "@/stores/catalog";
import { useReferrals } from "@/stores/referrals";
import { useSession } from "@/stores/session";

/**
 * "Ali invited you · finish setup to earn 50 coins". Before sign-up it reads
 * the captured link's preview; after, `invitedBy` from the server (also set
 * when the code came with the account). Nothing when there's no invite.
 */
export function InviteBanner({ className }: { className?: string }) {
  const invitedBy = useSession((s) => s.invitedBy);
  const signedIn = useSession((s) => s.me != null);
  const preview = useReferrals((s) => s.preview);
  const captured = useReferrals((s) => s.captured);
  const catalogCoins = useCatalog((s) => s.economy.inviteeRewardCoins);

  let name: string | null = null;
  let avatar = "";
  let coins = catalogCoins;
  if (signedIn) {
    if (!invitedBy || invitedBy.status === "REJECTED" || invitedBy.status === "REWARDED") return null;
    name = invitedBy.name;
  } else {
    if (!captured || !preview || preview.code !== captured.code || !preview.valid) return null;
    name = preview.name;
    avatar = preview.avatarUrl ?? "";
    coins = preview.inviteeCoins || catalogCoins;
  }
  const title = name ? `${name} invited you` : "You're invited";

  return (
    <div role="status" className={cn("flex items-center rounded-[20px] border border-gold/24 bg-gold/8 px-3.5 py-3", className)}>
      {avatar ? (
        <Avatar url={avatar} name={name ?? "?"} size={40} />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-gold/14">
          <Icon name="card_giftcard" size={22} className="text-gold" />
        </span>
      )}
      <span className="ml-3 min-w-0 flex-1">
        <span className="type-title block truncate text-[14.5px]">{title}</span>
        <span className="type-body block text-[12.5px] text-text2">
          Finish setup to earn <span className="type-number text-gold">{coins} coins</span>
        </span>
      </span>
    </div>
  );
}
