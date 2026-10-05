"use client";

import { useEffect, useRef, useState } from "react";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { openSheet } from "@/stores/ui";

/** Opens the front camera in a sheet and resolves with one JPEG frame (or undefined). */
export const capturePhoto = (label = "Take selfie") => openSheet<Blob>((close) => <CameraSheet onShot={close} label={label} />);

/** Front camera preview → one JPEG frame. */
function CameraSheet({ onShot, label }: { onShot: (b?: Blob) => void; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let s: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((m) => {
        s = m;
        setStream(m);
        if (video.current) {
          video.current.srcObject = m;
          void video.current.play().catch(() => {});
        }
      })
      .catch(() => setError("Couldn't open the camera. Check Vibe's camera permission in the browser."));
    return () => s?.getTracks().forEach((t) => t.stop());
  }, []);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Un-mirror: the preview is mirrored like a mirror, the photo is not.
    ctx.drawImage(v, 0, 0);
    canvas.toBlob((b) => b && onShot(b), "image/jpeg", 0.9);
  };

  return (
    <div className="flex flex-col px-5 pt-2 pb-5">
      <div className="relative aspect-[3/4] overflow-hidden rounded-[24px] border border-line bg-surface2">
        <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full -scale-x-100 object-cover" />
        {!stream && !error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner className="text-trust" />
          </div>
        ) : null}
        {error ? <p className="type-body absolute inset-0 flex items-center justify-center p-6 text-center text-[14px] text-text2">{error}</p> : null}
        <div className="pointer-events-none absolute inset-[12%] rounded-[50%] border-2 border-white/30" />
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        <GradientButton label={label} icon="photo_camera" tone="gem" onClick={stream ? capture : undefined} />
        <GhostButton label="Cancel" expand onClick={() => onShot(undefined)} />
      </div>
    </div>
  );
}
