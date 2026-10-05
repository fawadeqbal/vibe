"use client";

import { useEffect, useRef, useState } from "react";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { CAPTURE_SECONDS, CAPTURE_STEP, type CaptureStep, type LivenessStep } from "@/lib/liveness";
import { openSheet } from "@/stores/ui";

import { CameraPreview, useFrontCamera } from "./camera-capture";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The guided selfie: a front-facing photo, then the server's moves, each taken
 * automatically after a short countdown. `check` runs while the sheet shows
 * "Checking…"; the sheet resolves with its result (undefined if closed).
 */
export function captureLiveness<T>(steps: LivenessStep[], check: (frames: Blob[]) => Promise<T>) {
  return openSheet<T>((close) => <LivenessSheet steps={steps} onCancel={() => close(undefined)} onFrames={async (frames) => close(await check(frames))} />);
}

type Phase = { kind: "ready" } | { kind: "capturing"; index: number; count: number } | { kind: "checking" } | { kind: "failed"; message: string };

function LivenessSheet({ steps, onFrames, onCancel }: { steps: LivenessStep[]; onFrames: (frames: Blob[]) => Promise<void>; onCancel: () => void }) {
  const { video, ready, error, grab } = useFrontCamera();
  const all: CaptureStep[] = ["front", ...steps];
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const [flash, setFlash] = useState(false);
  // Set on every mount: React Strict Mode unmounts and remounts once in development.
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = async () => {
    const frames: Blob[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let c = CAPTURE_SECONDS; c > 0; c--) {
        if (!alive.current) return;
        setPhase({ kind: "capturing", index: i, count: c });
        await sleep(1000);
      }
      const frame = await grab();
      if (!alive.current) return;
      if (!frame) return setPhase({ kind: "failed", message: "The camera stopped. Try again." });
      frames.push(frame);
      setFlash(true);
      setTimeout(() => alive.current && setFlash(false), 160);
    }
    setPhase({ kind: "checking" });
    try {
      await onFrames(frames);
    } catch {
      if (alive.current) setPhase({ kind: "failed", message: "Couldn't send the photos. Check your connection and try again." });
    }
  };

  const current = phase.kind === "capturing" ? all[phase.index] : null;
  const done = phase.kind === "capturing" ? phase.index : phase.kind === "checking" ? all.length : 0;
  const moves = steps.map((s) => CAPTURE_STEP[s].title.toLowerCase()).join(", then ");

  return (
    <div className="flex flex-col px-5 pt-2 pb-5">
      <div className="flex gap-1.5" aria-hidden>
        {all.map((s, i) => (
          <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i < done ? "bg-trust" : i === done && phase.kind === "capturing" ? "bg-trust/45" : "bg-white/12")} />
        ))}
      </div>

      <div className="mt-3.5 mb-3.5 flex min-h-[48px] items-center gap-3" aria-live="polite">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-trust/14">
          <Icon name={current ? CAPTURE_STEP[current].icon : phase.kind === "checking" ? "verified_user" : "photo_camera_front"} size={22} className="text-trust" />
        </span>
        <div className="min-w-0">
          <p className="type-title text-[17px]">
            {current ? CAPTURE_STEP[current].title : phase.kind === "checking" ? "Checking…" : phase.kind === "failed" ? "That didn't work" : `${all.length} quick poses`}
          </p>
          <p className="type-body mt-0.5 text-[13px] text-text2">
            {current
              ? "Hold it — the photo is taken automatically."
              : phase.kind === "checking"
                ? "Comparing with your profile photo."
                : phase.kind === "failed"
                  ? phase.message
                  : `Look straight at the camera, then ${moves}.`}
          </p>
        </div>
      </div>

      <CameraPreview video={video} ready={ready} error={error} ovalClassName={phase.kind === "capturing" || phase.kind === "checking" ? "border-trust/80" : undefined}>
        {phase.kind === "capturing" ? (
          <div className="absolute inset-x-0 bottom-5 flex justify-center">
            <span key={`${phase.index}-${phase.count}`} className="type-number flex size-14 items-center justify-center rounded-full bg-black/45 text-[26px] text-white backdrop-blur-md" style={{ animation: "vibe-dialog-in 200ms ease-out" }}>
              {phase.count}
            </span>
          </div>
        ) : null}
        {phase.kind === "checking" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <Spinner className="text-trust" />
          </div>
        ) : null}
        <div className={cn("pointer-events-none absolute inset-0 bg-white transition-opacity duration-150", flash ? "opacity-60" : "opacity-0")} />
      </CameraPreview>

      <div className="mt-4 flex flex-col gap-2.5">
        {phase.kind === "ready" || phase.kind === "failed" ? (
          <GradientButton label={phase.kind === "failed" ? "Try again" : "Start"} icon="photo_camera_front" tone="gem" onClick={ready ? () => void run() : undefined} />
        ) : null}
        {phase.kind !== "checking" ? <GhostButton label="Cancel" expand onClick={onCancel} /> : null}
      </div>
    </div>
  );
}
