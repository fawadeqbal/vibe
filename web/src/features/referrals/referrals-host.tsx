"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Headline } from "@/components/ui/typography";
import { milestoneRewardLabel } from "@/lib/referrals";
import { type MilestoneHit, useReferrals } from "@/stores/referrals";
import { openDialog } from "@/stores/ui";

/** Celebrates an invite milestone (`referral:milestone`) wherever you are. Mounted once with the tabs. */
export function ReferralsHost() {
  const router = useRouter();
  const hit = useReferrals((s) => s.milestone);

  useEffect(() => {
    if (!hit) return;
    useReferrals.getState().clearMilestone();
    void openDialog<boolean>((close) => <MilestoneDialog hit={hit} onClose={close} />).then((more) => {
      if (more) router.push("/invite");
    });
  }, [hit, router]);

  return null;
}

function MilestoneDialog({ hit, onClose }: { hit: MilestoneHit; onClose: (more?: boolean) => void }) {
  const vip = hit.reward.kind === "vip";
  return (
    <div className="flex max-w-[340px] flex-col items-center px-6 pt-7 pb-6 text-center">
      <span className="relative flex size-24 items-center justify-center" style={{ animation: "vibe-pop 420ms var(--ease-spring) both" }}>
        {[0, 0.3].map((d) => (
          <span key={d} className="absolute inset-0 rounded-full border-[3px] border-gold" style={{ opacity: 0, animation: `vibe-burst-ring 1.4s ease-out ${d}s 2 both` }} aria-hidden />
        ))}
        <span className="bg-gold-grad flex size-20 items-center justify-center rounded-full shadow-[0_10px_35.6px_rgb(255_200_87/.32)]">
          <Icon name={vip ? "workspace_premium" : "military_tech"} size={42} className="text-on-gold-icon" />
        </span>
      </span>
      <Headline as="h2" text={`${hit.count} friends `} accent="joined!" size={28} align="center" className="mt-4" />
      <p className="type-body mt-2 text-[14px] leading-[1.5] text-text2">
        You unlocked <span className="font-semibold text-gold">{milestoneRewardLabel(hit.reward)}</span>
        {vip ? " 👑" : " 🎖️"}. Thanks for bringing people to Vibe.
      </p>
      <div className="mt-5 flex w-full flex-col gap-2">
        <GradientButton label="Nice!" height={48} onClick={() => onClose(false)} />
        <GhostButton label="See my invites" expand height={44} onClick={() => onClose(true)} />
      </div>
    </div>
  );
}
