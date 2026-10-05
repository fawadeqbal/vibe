"use client";

import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { openSheet } from "@/stores/ui";

/** Frames are scaled to this longest side before upload (the server's face check works at this size). */
const MAX_SIDE = 1280;

/**
 * The front camera: a <video> to show, and `grab()` for one JPEG frame. Frames are
 * the camera's own view (not mirrored); only the preview is mirrored, like a mirror.
 */
export function useFrontCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((m) => {
        if (cancelled) return m.getTracks().forEach((t) => t.stop());
        stream = m;
        const v = video.current;
        if (!v) return;
        v.srcObject = m;
        v.onloadedmetadata = () => setReady(true);
        void v.play().catch(() => {});
      })
      .catch(() => setError("Couldn't open the camera. Check Vibe's camera permission in the browser."));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const grab = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const v = video.current;
        if (!v || !v.videoWidth) return resolve(null);
        const k = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(v.videoWidth * k);
        canvas.height = Math.round(v.videoHeight * k);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
      }),
    [],
  );

  return { video, ready, error, grab };
}

/** The 3:4 mirrored preview with the face oval. `children` draw on top (countdown, hints). */
export function CameraPreview({
  video,
  ready,
  error,
  ovalClassName,
  children,
}: {
  video: RefObject<HTMLVideoElement | null>;
  ready: boolean;
  error: string | null;
  ovalClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-[24px] border border-line bg-surface2">
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full -scale-x-100 object-cover" />
      {!ready && !error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="text-trust" />
        </div>
      ) : null}
      {error ? <p className="type-body absolute inset-0 flex items-center justify-center p-6 text-center text-[14px] text-text2">{error}</p> : null}
      <div className={cn("pointer-events-none absolute inset-[12%] rounded-[50%] border-2 border-white/30 transition-colors duration-300", ovalClassName)} />
      {children}
    </div>
  );
}

/** Opens the front camera in a sheet and resolves with one JPEG frame (or undefined). */
export const capturePhoto = (label = "Take selfie") => openSheet<Blob>((close) => <CameraSheet onShot={close} label={label} />);

/** Front camera preview → one JPEG frame. */
function CameraSheet({ onShot, label }: { onShot: (b?: Blob) => void; label: string }) {
  const { video, ready, error, grab } = useFrontCamera();
  const capture = async () => {
    const b = await grab();
    if (b) onShot(b);
  };
  return (
    <div className="flex flex-col px-5 pt-2 pb-5">
      <CameraPreview video={video} ready={ready} error={error} />
      <div className="mt-4 flex flex-col gap-2.5">
        <GradientButton label={label} icon="photo_camera" tone="gem" onClick={ready ? () => void capture() : undefined} />
        <GhostButton label="Cancel" expand onClick={() => onShot(undefined)} />
      </div>
    </div>
  );
}
