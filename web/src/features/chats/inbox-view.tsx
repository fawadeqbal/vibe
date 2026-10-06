"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { RichBody } from "@/components/shared/rich-body";
import { TeamAvatar } from "@/components/shared/team-avatar";
import { GradientButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { agoShort } from "@/lib/format";
import type { TeamMessage } from "@/lib/models";
import { useInbox } from "@/stores/inbox";

/**
 * "Messages from Vibe": everything the team has sent this person from the
 * admin panel, newest first. Opening the screen marks them read.
 */
export function InboxView() {
  const router = useRouter();
  const messages = useInbox((s) => s.messages);
  const hasMore = useInbox((s) => s.cursor != null);
  const end = useRef<HTMLDivElement>(null);

  // After a moment, so the unread styling is seen first.
  useEffect(() => {
    const t = setTimeout(() => void useInbox.getState().markAllRead(), 1200);
    return () => clearTimeout(t);
  }, []);

  // Older pages as the end comes into view.
  useEffect(() => {
    const el = end.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void useInbox.getState().loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:h-dvh">
      <AppBar title="Messages from Vibe" onBack={() => router.push("/chats")} className="lg:pl-5 lg:[&>span:first-child]:hidden" />
      {!messages.length ? (
        <EmptyState className="flex-1" icon="mark_email_read" iconVariant="outlined" title="Nothing " accent="yet" body="News and notes from the Vibe team will show up here." />
      ) : (
        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-8">
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageCard key={m.id} m={m} />
            ))}
          </div>
          {hasMore ? (
            <div ref={end} className="flex justify-center p-4">
              <Spinner size={22} stroke={2} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MessageCard({ m }: { m: TeamMessage }) {
  return (
    <article className={cn("glass relative rounded-card border p-4", m.read ? "border-transparent" : "border-pink/35")} aria-label={m.read ? undefined : "Unread"}>
      <div className="flex items-center">
        <TeamAvatar size={30} />
        <span className="type-body ml-2.5 flex-1 text-[12.5px] text-text2">Vibe team · {agoShort(m.at)}</span>
        {!m.read ? <span className="size-2 rounded-full bg-pink" /> : null}
      </div>
      <h3 className="type-title mt-3 text-[17px] font-semibold">{m.title}</h3>
      <div className="mt-1.5">
        <RichBody text={m.body} />
      </div>
      {m.buttonLabel && m.buttonUrl ? (
        <div className="mt-3.5">
          <GradientButton label={m.buttonLabel} height={44} icon="open_in_new" iconAfter onClick={() => window.open(m.buttonUrl!, "_blank", "noopener,noreferrer")} />
        </div>
      ) : null}
    </article>
  );
}
