"use client";

import { useState } from "react";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";
import { Headline } from "@/components/ui/typography";
import { errorMessage } from "@/lib/api/errors";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";

/** Camera and microphone, explained before the browser asks. */
export function PermissionsScreen() {
  const cameraGranted = useSession((s) => s.cameraGranted);
  const micGranted = useSession((s) => s.micGranted);
  const granted = cameraGranted && micGranted;
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const finish = async () => {
    try {
      await useSession.getState().finishOnboarding();
    } catch (e) {
      toast(errorMessage(e), { error: true });
    }
  };

  const ask = async () => {
    setBusy(true);
    const ok = await useSession.getState().requestPermissions();
    setBusy(false);
    setDenied(!ok);
    if (ok) await finish();
  };

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-6 pt-8 pb-6 lg:my-auto lg:flex-none">
        <Headline text="Vibe needs your camera and " accent="mic" size={32} accentColor="pink-soft" />
        <p className="type-body mt-2.5 text-[15px] leading-[1.5] text-text2">
          That is the whole app. Nothing is recorded; the stream goes to the person you are talking to and nowhere else.
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <PermissionRow icon="videocam" title="Camera" body="So they can see you. You can turn it off any time." granted={cameraGranted} />
          <PermissionRow icon="mic" title="Microphone" body="So they can hear you. Mute is one tap away." granted={micGranted} />
        </div>
        <div className="mt-[18px] flex items-center">
          <Icon name="shield" size={16} className="text-trust" />
          <span className="type-label ml-2 flex-1 text-[12.5px] font-medium text-text2">Nothing is recorded. Both videos start blurred.</span>
        </div>
        <div className="min-h-8 flex-1 lg:min-h-10 lg:flex-none" />
        {denied ? (
          <>
            <Panel className="flex items-center border-bad/40 bg-bad/10">
              <Icon name="error_outline" size={20} className="text-bad" />
              <span className="type-body ml-2.5 flex-1 text-[13px]">
                Without both, matches cannot start. Allow the camera and microphone for this site in your browser (the icon next to the address), then try again.
              </span>
            </Panel>
            <div className="mt-3">
              <GhostButton label="Try again" icon="refresh" expand onClick={() => void ask()} />
            </div>
            <div className="h-3" />
          </>
        ) : null}
        <GradientButton label={granted ? "Continue" : "Allow access"} busy={busy} onClick={() => void (granted ? finish() : ask())} />
      </div>
    </div>
  );
}

function PermissionRow({ icon, title, body, granted }: { icon: string; title: string; body: string; granted: boolean }) {
  return (
    <Panel className="flex items-center">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-pink/12">
        <Icon name={icon} className="text-pink-soft" />
      </span>
      <span className="ml-3.5 flex min-w-0 flex-1 flex-col">
        <span className="type-title text-[15px]">{title}</span>
        <span className="type-body mt-0.5 text-[13px] text-text2">{body}</span>
      </span>
      <Icon name={granted ? "check_circle" : "radio_button_unchecked"} className={granted ? "text-trust" : "text-muted"} label={granted ? "Allowed" : "Not allowed yet"} />
    </Panel>
  );
}
