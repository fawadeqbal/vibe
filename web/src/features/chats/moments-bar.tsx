"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { CircleIconButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/models";
import { useMoments } from "@/stores/moments";
import { useSession } from "@/stores/session";
import { openSheet, toast } from "@/stores/ui";

import { openMomentViewer, type Reel } from "./moment-viewer";

/**
 * Moments at the top of Chats: you first ("Your moment", + to add), then
 * the people you follow and your friends — a gradient ring while something
 * is unseen, grey once you've seen it all.
 */
export function MomentsBar() {
  const me = useSession((s) => s.me);
  const mine = useMoments((s) => s.mine);
  const people = useMoments((s) => s.people);
  if (!me) return null;

  const ownReel: Reel = { author: me, moments: mine, own: true };
  const reels: Reel[] = people.map((g) => ({ author: g.author, moments: g.moments, own: false }));

  return (
    <div className="no-scrollbar -mx-5 flex gap-3.5 overflow-x-auto px-5 pt-1 pb-3" role="list" aria-label="Moments">
      <div role="listitem" className="flex w-[76px] shrink-0 flex-col items-center">
        <span className="relative">
          <button type="button" aria-label={mine.length ? "View your moments" : "Add a moment"} onClick={() => (mine.length ? openMomentViewer([ownReel], 0) : void openMomentComposer())}>
            {mine.length ? <Avatar url={me.avatarUrl} name={me.name} size={64} ring /> : <Avatar url={me.avatarUrl} name={me.name} size={64} ring ringMuted />}
          </button>
          <button
            type="button"
            aria-label="Add a moment"
            onClick={() => void openMomentComposer()}
            className="absolute -right-0.5 -bottom-0.5 flex size-[22px] items-center justify-center rounded-full border-2 border-bg bg-pink text-white transition-[filter] hover:brightness-110"
          >
            <Icon name="add" size={15} />
          </button>
        </span>
        <span className="type-label mt-1.5 max-w-full truncate text-[11px] text-text2">Your moment</span>
      </div>
      {reels.map((r, i) => (
        <PersonItem key={r.author.id} author={r.author} unseen={r.moments.some((m) => !m.seen)} onOpen={() => openMomentViewer(reels, i)} />
      ))}
    </div>
  );
}

function PersonItem({ author, unseen, onOpen }: { author: Profile; unseen: boolean; onOpen: () => void }) {
  return (
    <div role="listitem" className="flex w-[68px] shrink-0 flex-col items-center">
      <button type="button" aria-label={`${author.name}'s moments${unseen ? ", new" : ""}`} onClick={onOpen}>
        <Avatar url={author.avatarUrl} name={author.name} size={64} ring ringMuted={!unseen} />
      </button>
      <span className={cn("type-label mt-1.5 max-w-full truncate text-[11px]", unseen ? "text-text" : "text-muted")}>{author.name.split(" ")[0]}</span>
    </div>
  );
}

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/** Pick a photo → caption → Post. */
export const openMomentComposer = () => openSheet<void>((close) => <MomentComposer onDone={() => close()} />);

function MomentComposer({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError("Use a JPEG, PNG or WebP photo.");
    if (f.size > MAX_BYTES) return setError("That photo is over 5 MB.");
    setError(null);
    setFile(f);
    // A data URL for the preview: nothing to revoke when the sheet closes.
    const reader = new FileReader();
    reader.onload = () => setUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(f);
  };

  const post = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      await useMoments.getState().post(file, caption);
      toast("Moment posted · visible for 24 hours");
      onDone();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "MOMENT_LIMIT" ? "You can have 10 moments at a time. Delete one or wait for one to expire." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <div className="flex items-center">
        <h2 className="type-title-lg flex-1 text-[22px]">New moment</h2>
        <CircleIconButton icon="close" label="Close" onClick={onDone} />
      </div>
      <p className="type-body mt-1 text-[13px] text-text2">A photo for 24 hours. Your followers and friends see it at the top of Chats.</p>
      <label className="relative mt-4 block cursor-pointer overflow-hidden rounded-card border border-dashed border-line-strong bg-surface2 transition-colors hover:bg-surface3/70">
        <input type="file" accept="image/*" className="sr-only" aria-label="Choose a photo" onChange={(e) => pick(e.target.files?.[0])} />
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Your photo" className="mx-auto block max-h-[46dvh] w-full object-contain" />
        ) : (
          <span className="flex h-[220px] flex-col items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-white/8">
              <Icon name="add_photo_alternate" size={28} className="text-text" />
            </span>
            <span className="type-label mt-3 text-[14px]">Choose a photo</span>
            <span className="type-body mt-0.5 text-[12px] text-muted">JPEG, PNG or WebP · up to 5 MB</span>
          </span>
        )}
        {url ? (
          <span className="absolute top-2.5 right-2.5 flex h-8 items-center rounded-full bg-black/55 px-3 backdrop-blur-[12px]">
            <Icon name="swap_horiz" size={16} className="text-white" />
            <span className="type-label ml-1 text-[12px] text-white">Change</span>
          </span>
        ) : null}
      </label>
      <TextField className="mt-3" value={caption} maxLength={120} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption (optional)" aria-label="Caption" />
      {error ? (
        <p role="alert" className="type-body mt-2 px-1 text-[12.5px] text-bad">
          {error}
        </p>
      ) : null}
      <div className="mt-4">
        <GradientButton label="Post" icon="send" busy={busy} onClick={file ? () => void post() : undefined} />
      </div>
    </div>
  );
}
