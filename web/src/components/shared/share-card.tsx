"use client";

import { useEffect, useState } from "react";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { config } from "@/lib/config";
import { inviteLink, whatsappUrl } from "@/lib/referrals";
import { renderShareCard, type ShareCard, shareText } from "@/lib/share-card";
import { useCatalog } from "@/stores/catalog";
import { useReferrals } from "@/stores/referrals";
import { useSession } from "@/stores/session";
import { openSheet, toast } from "@/stores/ui";

/** Copies text; false when the browser refuses (no permission / insecure origin). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** System share sheet with text + link; copies instead where there is none. Resolves false when nothing happened. */
export async function shareLink({ text, url = "", title = "Vibe" }: { text: string; url?: string; title?: string }): Promise<boolean> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, ...(url ? { url } : {}) });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false;
    }
  }
  const ok = await copyText(`${text} ${url}`.trim());
  toast(ok ? "Link copied" : "Couldn't copy. Long-press the link to copy it.", { error: !ok });
  return ok;
}

/** Your invite link (from `GET /referrals` when loaded, else built from your code). */
export function myInviteLink(): string | null {
  const ov = useReferrals.getState().overview;
  if (ov?.link) return ov.link;
  const code = useSession.getState().inviteCode;
  return code ? inviteLink(config.siteUrl, code) : null;
}

/** Opens the share sheet for a card: the rendered image, then share / save / copy. */
export const openShareCard = (card: ShareCard) => openSheet<void>((close) => <ShareCardSheet card={card} onDone={() => close()} />);

function ShareCardSheet({ card, onDone }: { card: ShareCard; onDone: () => void }) {
  const coins = useCatalog((s) => s.economy.inviteeRewardCoins);
  const link = myInviteLink() ?? config.siteUrl;
  const text = shareText(card, link, coins);
  const [drawn, setDrawn] = useState<{ png: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const png = drawn?.png ?? null;
  const url = drawn?.url ?? null;

  // Draw once per mount; the preview's object URL is released with it (Strict Mode re-runs make a new one).
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    renderShareCard(card, { link, inviteeCoins: coins })
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setDrawn({ png: b, url: made });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [card, link, coins]);

  const file = png ? new File([png], `vibe-${card.kind}.png`, { type: "image/png" }) : null;
  const canShareFile = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  const share = async () => {
    if (canShareFile && file) {
      try {
        await navigator.share({ files: [file], text });
        onDone();
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    if (await shareLink({ text })) onDone();
  };

  const save = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibe-${card.kind}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col px-5 pt-1 pb-5">
      <h2 className="type-title-lg text-[20px]">Share</h2>
      <p className="type-body mt-1 text-[13px] text-text2">Friends who join with your link get {coins} free coins.</p>
      <div className="mx-auto mt-4 flex aspect-[4/5] w-full max-w-[280px] items-center justify-center overflow-hidden rounded-[22px] border border-line bg-bg2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Your share card" className="size-full object-cover" />
        ) : failed ? (
          <p className="type-body p-6 text-center text-[13px] text-text2">Couldn&apos;t draw the picture. You can still share the link.</p>
        ) : (
          <Spinner size={28} stroke={3} className="text-text2" />
        )}
      </div>
      <p className="type-body mt-3 line-clamp-3 rounded-[16px] bg-surface2 px-3.5 py-2.5 text-[12.5px] text-text2">{text}</p>
      <div className="mt-4">
        <GradientButton label="Share" icon="ios_share" busy={!png && !failed} onClick={() => void share()} />
      </div>
      <div className="mt-2.5 flex gap-2">
        <GhostButton label="Save image" icon="download" expand className="flex-1" onClick={url ? save : undefined} />
        <GhostButton
          label="WhatsApp"
          icon="chat"
          expand
          className="flex-1"
          onClick={() => {
            window.open(whatsappUrl(text), "_blank", "noopener,noreferrer");
            onDone();
          }}
        />
      </div>
      <div className="mt-2">
        <GhostButton
          label="Copy text and link"
          icon="content_copy"
          expand
          height={44}
          labelClassName="text-text2"
          onClick={async () => {
            const ok = await copyText(text);
            toast(ok ? "Copied" : "Couldn't copy", { error: !ok });
          }}
        />
      </div>
    </div>
  );
}
