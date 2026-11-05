"use client";

import { type ComponentProps, type ReactNode, useSyncExternalStore } from "react";

import { Cta } from "@/components/cta";
import { site } from "@/lib/site";

export type Device = "android" | "ios" | "computer";

/** What the visitor is on. iPadOS reports itself as a Mac, so touch decides. */
export function detectDevice(ua: string, touchPoints = 0): Device {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && touchPoints > 1)) return "ios";
  return "computer";
}

/** "android" until the page knows better: most visitors are on Android, so most never see a swap. */
export function useDevice(): Device {
  return useSyncExternalStore(
    noChanges,
    () => detectDevice(navigator.userAgent, navigator.maxTouchPoints),
    () => "android",
  );
}

/** The device never changes while the page is open. */
const noChanges = () => () => {};

type Props = Omit<ComponentProps<typeof Cta>, "href" | "children" | "track"> & {
  /** Button id; on iPhone and computers it becomes `<track>_web`. */
  track: string;
  /** Label for Android: links to the Android download. */
  android: ReactNode;
  /** Label everywhere else: links to the web app. `null` hides the button (when a web-app button already sits next to it). */
  other: ReactNode | null;
};

/**
 * An app button that fits the device: the Android download on Android, the
 * web app on iPhone and computers — where an APK can't be installed.
 */
export function AppCta({ track, android, other, ...cta }: Props) {
  const device = useDevice();
  if (device === "android") {
    return (
      <Cta href={site.links.android} track={track} {...cta}>
        {android}
      </Cta>
    );
  }
  if (other === null) return null;
  return (
    <Cta href={site.links.webApp} track={`${track}_web`} {...cta}>
      {other}
    </Cta>
  );
}
