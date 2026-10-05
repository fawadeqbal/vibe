"use client";

import { GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import type { VerificationState } from "@/lib/payments";
import { useSession } from "@/stores/session";
import { openSheet, toast } from "@/stores/ui";

import { capturePhoto } from "./camera-capture";

/**
 * Selfie verification, from anywhere (profile, safety sheet, a cash-out that
 * needs KYC): explain → front camera → upload → result.
 */
export async function startSelfieVerification(): Promise<VerificationState | null> {
  const go = await openSheet<boolean>((close) => <SelfieIntro onGo={() => close(true)} />);
  if (!go) return null;
  const shot = await capturePhoto();
  if (!shot) return null;
  try {
    const v = await useSession.getState().verifySelfie(shot);
    if (v.status === "approved") toast("Verified — badge added");
    else if (v.status === "pending") toast("Thanks! A person will check your selfie shortly — we'll let you know.");
    else if (v.status === "rejected") toast(v.reason ?? "We could not verify you. Try again in good light.", { error: true });
    return v;
  } catch (e) {
    toast(errorMessage(e), { error: true });
    return null;
  }
}

/** One line for the profile's verification row. */
export function verificationSubtitle(v: VerificationState, verified: boolean): string {
  if (verified) return "People in safe mode can match with you.";
  if (v.status === "pending") return "Selfie in review — we'll let you know.";
  if (v.status === "rejected") return `Not verified: ${v.reason ?? "try again in good light"}. Try again.`;
  return "Quick selfie check. More matches, and you show up in safe mode.";
}

/** The teal "Verify" pill used wherever verification is offered. */
export function VerifyPill({ onClick, busy = false }: { onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={busy ? undefined : onClick}
      className="flex h-[34px] min-w-[72px] items-center justify-center rounded-full bg-trust px-3.5 text-on-gem transition-[filter] hover:brightness-110"
    >
      {busy ? <Spinner size={16} stroke={2} className="text-on-gem" /> : <span className="type-label text-[13px] font-bold">Verify</span>}
    </button>
  );
}

function SelfieIntro({ onGo }: { onGo: () => void }) {
  const tip = (icon: string, text: string) => (
    <div className="mb-2.5 flex items-center">
      <Icon name={icon} size={18} className="text-trust" />
      <span className="type-body ml-2.5 flex-1 text-[14px] text-text2">{text}</span>
    </div>
  );
  return (
    <div className="flex flex-col px-6 pt-2 pb-5">
      <Icon name="verified_user" size={40} className="self-center text-trust" />
      <h2 className="type-title-lg mt-2.5 text-center text-[20px]">Take a quick selfie</h2>
      <p className="type-body mt-1.5 text-center text-[14px] text-text2">We compare it with your profile photo. It is never shown to anyone.</p>
      <div className="mt-[18px]">
        {tip("wb_sunny", "Face the light, no sunglasses or mask.")}
        {tip("face", "Just you, looking at the camera.")}
        {tip("photo", "Your profile photo should show your face too.")}
      </div>
      <div className="mt-2.5">
        <GradientButton label="Open camera" icon="photo_camera_front" tone="gem" onClick={onGo} />
      </div>
    </div>
  );
}
