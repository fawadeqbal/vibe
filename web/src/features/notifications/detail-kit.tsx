"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/errors";
import { alpha, color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";

/**
 * Pieces shared by the pages a notification opens (receipt, cash-out,
 * account status…): a page with a back button, a big status icon, a
 * label/value card, and "this is gone" when the thing no longer exists.
 */
export function DetailPage({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const router = useRouter();
  return (
    <Screen
      width="sm"
      header={<AppBar title={title} onBack={() => (history.length > 1 ? router.back() : router.push("/notifications"))} />}
      footer={footer}
      bodyClassName="px-4"
    >
      {children}
    </Screen>
  );
}

/** The pinned buttons under a detail page. */
export function DetailActions({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2.5 px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]">{children}</div>;
}

export function DetailHero({ icon, tone, title, sub, variant }: { icon: string; tone: Tone; title: string; sub?: ReactNode; variant?: "round" | "outlined" }) {
  return (
    <div className="flex flex-col items-center px-6 pt-4 pb-1.5 text-center">
      <span
        className="grid size-[76px] place-items-center rounded-full"
        style={{ backgroundColor: alpha(tone, 0.15), boxShadow: `0 0 0 8px ${alpha(tone, 0.06)}` }}
      >
        <Icon name={icon} variant={variant} size={36} style={{ color: color(tone) }} />
      </span>
      <h2 className="type-title-lg mt-[18px] text-[22px]">{title}</h2>
      {sub ? <p className="type-body mt-1 text-[13.5px] leading-[1.5] text-text2">{sub}</p> : null}
    </div>
  );
}

/** Label on the left, value on the right; values can be anything (a tag, a copy button). */
export function KeyValues({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line-soft overflow-hidden rounded-[22px] border border-line bg-surface px-4", className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 py-3.5">
          <dt className="type-body flex-1 text-[13.5px] text-text2">{k}</dt>
          <dd className="type-title text-right text-[14px] font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatusTag({ text, tone, icon }: { text: string; tone: Tone; icon?: string }) {
  return (
    <span
      className="type-label inline-flex h-[26px] items-center gap-1 rounded-full px-2.5 text-[12.5px] font-bold"
      style={{ backgroundColor: alpha(tone, 0.14), color: color(tone) }}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {text}
    </span>
  );
}

/** A reference with a copy button. */
export function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setDone(true));
        setTimeout(() => setDone(false), 1500);
      }}
      aria-label={`Copy ${text}`}
    >
      <span className="max-w-[160px] truncate">{text}</span>
      <Icon name={done ? "check" : "content_copy"} variant="outlined" size={15} className="text-muted" />
    </button>
  );
}

export function SectionLabel({ text }: { text: string }) {
  return <h2 className="type-overline px-1 pt-[22px] pb-2">{text}</h2>;
}

/** Loads one thing; a 404 shows "gone" instead of sending you somewhere else. */
export function useDetail<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; gone: boolean; error: boolean } {
  const [state, setState] = useState<{ data: T | null; gone: boolean; error: boolean }>({ data: null, gone: false, error: false });
  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && setState({ data, gone: false, error: false }),
      (e) => alive && setState({ data: null, gone: e instanceof ApiError && (e.status === 404 || e.status === 403), error: true }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function DetailLoading() {
  return (
    <div className="flex justify-center py-24">
      <Spinner />
    </div>
  );
}

export function DetailGone({ what }: { what: string }) {
  return (
    <EmptyState
      className="py-20"
      icon="cloud_off"
      iconVariant="outlined"
      title="Not here any more"
      body={`This ${what} was removed or isn’t yours, so there’s nothing to show.`}
    />
  );
}

export function DetailError() {
  return <EmptyState className="py-20" icon="wifi_off" title="Couldn’t load this" body="Check your connection and try again." />;
}
