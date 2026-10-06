"use client";

import { useEffect, useState } from "react";

import { copyText } from "@/components/shared/share-card";
import { GhostButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { LINK_SOURCES, partnerLink, sourceLabel } from "@/lib/affiliate";
import { cn } from "@/lib/cn";
import { openSheet, toast } from "@/stores/ui";

/** Your partner link per channel (`?s=tiktok` …) so the stats split by where people came from. */
export function LinkBuilder({ link, code }: { link: string; code: string }) {
  const [source, setSource] = useState<string | null>(null);
  const url = partnerLink(link, source);

  return (
    <Panel className="p-4">
      <p className="type-overline text-[10px]">Your code</p>
      <p className="type-mono mt-0.5 text-[22px] font-semibold tracking-[1px] text-text">{code}</p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Where you'll post the link">
        {[null, ...LINK_SOURCES].map((s) => {
          const on = s === source;
          return (
            <button
              key={s ?? "plain"}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSource(s)}
              className={cn("type-label h-8 shrink-0 rounded-full border px-3 text-[12.5px] transition-colors", on ? "border-violet bg-violet/16 text-text" : "border-line bg-surface2 text-text2 hover:text-text")}
            >
              {s ? sourceLabel(s) : "Any"}
            </button>
          );
        })}
      </div>
      <p className="type-mono mt-3 rounded-[14px] bg-surface2 px-3.5 py-3 text-[13px] break-all text-text">{url.replace(/^https?:\/\//, "")}</p>
      <div className="mt-3 flex gap-2">
        <GhostButton
          label="Copy link"
          icon="content_copy"
          expand
          className="flex-1"
          height={46}
          onClick={async () => {
            const ok = await copyText(url);
            toast(ok ? "Link copied" : "Couldn't copy. Long-press the link to copy it.", { error: !ok });
          }}
        />
        <GhostButton label="QR code" icon="qr_code_2" expand className="flex-1" height={46} onClick={() => void openSheet<void>(() => <QrSheet url={url} />)} />
      </div>
    </Panel>
  );
}

function QrSheet({ url }: { url: string }) {
  const [png, setPng] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((q) => q.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0b0a10", light: "#ffffff" } }))
      .then((d) => alive && setPng(d))
      .catch(() => alive && setPng(""));
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="flex flex-col items-center px-5 pt-1 pb-5">
      <h2 className="type-title-lg self-start text-[20px]">QR code</h2>
      <p className="type-body mt-1 self-start text-[13px] text-text2">For posters, stories and stream overlays.</p>
      <div className="mt-4 flex size-[240px] items-center justify-center overflow-hidden rounded-[20px] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {png ? <img src={png} alt={`QR code for ${url}`} className="size-full" /> : png === "" ? <span className="type-body p-4 text-center text-[13px] text-bg">Couldn&apos;t make the code.</span> : <Spinner size={28} stroke={3} className="text-bg" />}
      </div>
      <p className="type-mono mt-3 text-[12px] break-all text-text2">{url.replace(/^https?:\/\//, "")}</p>
      {png ? (
        <div className="mt-4 w-full">
          <GhostButton
            label="Save image"
            icon="download"
            expand
            onClick={() => {
              const a = document.createElement("a");
              a.href = png;
              a.download = "vibe-partner-qr.png";
              a.click();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
