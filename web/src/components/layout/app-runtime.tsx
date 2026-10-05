"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { startApp } from "@/stores/runtime";
import { profileReady, useSession } from "@/stores/session";
import { closeAllOverlays } from "@/stores/ui";

import { OverlayHost, ToastHost } from "./overlay-host";
import { Splash } from "./splash";

type Stage = "booting" | "signedOut" | "setup" | "permissions" | "ready";

const SIGNED_OUT = ["/welcome", "/sign-in"];
const ONBOARDING = [...SIGNED_OUT, "/setup", "/permissions"];

/** Where this stage of first-run may be, or null when the path is fine. */
function redirectFor(stage: Stage, path: string): string | null {
  switch (stage) {
    case "booting":
      return null;
    case "signedOut":
      return SIGNED_OUT.includes(path) ? null : "/welcome";
    case "setup":
      return path === "/setup" ? null : "/setup";
    case "permissions":
      return path === "/permissions" ? null : "/permissions";
    case "ready":
      return path === "/" || ONBOARDING.includes(path) ? "/match" : null;
  }
}

/** Long enough for the splash rings and the wordmark to land. */
const SPLASH_MIN_MS = 1500;

/**
 * The whole app's runtime: starts the session/socket lifecycle, keeps
 * people on the right first-run step (Flutter's auth → onboarding → home
 * routing), shows the splash until boot is done, and hosts toasts and
 * overlays.
 */
export function AppRuntime({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const booting = useSession((s) => s.booting);
  const me = useSession((s) => s.me);
  const onboarded = useSession((s) => s.onboarded);
  const [minDone, setMinDone] = useState(false);
  const [splashGone, setSplashGone] = useState(false);

  useEffect(() => {
    startApp();
    const t = setTimeout(() => setMinDone(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  // The hosted-payment return page runs in a popup: no gate, no splash.
  const bare = path === "/payment-return";
  const stage: Stage = booting ? "booting" : !me ? "signedOut" : !profileReady(me) ? "setup" : !onboarded ? "permissions" : "ready";
  const target = bare ? null : redirectFor(stage, path);

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  // A navigation closes any sheet or dialog left open by the previous page.
  useEffect(() => closeAllOverlays(), [path]);

  const ready = !booting && minDone;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setSplashGone(true), 250);
    return () => clearTimeout(t);
  }, [ready]);

  if (bare) return <>{children}</>;

  return (
    <>
      {stage !== "booting" && !target ? children : null}
      {!splashGone ? (
        <div className="relative z-[60] transition-opacity duration-250" style={{ opacity: ready ? 0 : 1 }}>
          <Splash />
        </div>
      ) : null}
      <OverlayHost />
      <ToastHost />
    </>
  );
}
