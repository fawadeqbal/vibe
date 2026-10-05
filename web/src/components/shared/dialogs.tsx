"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { TextButton } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/overlay";
import { color, type Tone } from "@/lib/colors";
import { openDialog } from "@/stores/ui";

/**
 * A yes/no question in the app's alert-dialog look. Resolves true when the
 * confirm action is chosen.
 */
export async function confirm({
  title,
  body,
  ok,
  cancel = "Cancel",
  okTone = "pink-soft",
}: {
  title: string;
  body?: string;
  ok: string;
  cancel?: string;
  okTone?: Tone;
}): Promise<boolean> {
  const res = await openDialog<boolean>((close) => (
    <AlertDialog
      title={title}
      actions={
        <>
          <TextButton className="text-text2" onClick={() => close(false)}>
            {cancel}
          </TextButton>
          <TextButton style={{ color: color(okTone) }} onClick={() => close(true)}>
            {ok}
          </TextButton>
        </>
      }
    >
      {body}
    </AlertDialog>
  ));
  return res === true;
}

/** A message with one "OK"-style action. */
export async function inform({ title, body, ok = "OK" }: { title: string; body?: string; ok?: string }) {
  await openDialog<void>((close) => <AlertDialog title={title} actions={<TextButton onClick={() => close()}>{ok}</TextButton>}>{body}</AlertDialog>);
}

/**
 * "Not enough coins" → offer the store. Returns a function screens call with
 * the reason ("A Rose costs 5 coins.").
 */
export function useNeedCoins() {
  const router = useRouter();
  return useCallback(
    async (why: string) => {
      const go = await confirm({ title: "Not enough coins", body: `${why}\n\nTop up, or earn free coins in the store.`, ok: "Get coins", cancel: "Not now" });
      if (go) router.push("/store");
    },
    [router],
  );
}
