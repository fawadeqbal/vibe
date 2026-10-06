"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { Spinner } from "@/components/ui/spinner";
import { RETURN_MESSAGE } from "@/lib/hosted-payment";

/**
 * Where hosted payment pages send people back. In the popup it tells the
 * checkout tab and closes; in the same tab it resumes the checkout.
 */
function Return() {
  const router = useRouter();
  const q = useSearchParams();
  useEffect(() => {
    const purchase = q.get("purchase");
    const status = q.get("status");
    if (window.opener && window.opener !== window) {
      window.opener.postMessage({ type: RETURN_MESSAGE, purchase, status }, window.location.origin);
      window.close();
      return;
    }
    const product = q.get("pack") ? `pack=${encodeURIComponent(q.get("pack")!)}` : `plan=${encodeURIComponent(q.get("plan") ?? "")}`;
    router.replace(`/checkout?${product}&purchase=${encodeURIComponent(purchase ?? "")}&status=${encodeURIComponent(status ?? "")}`);
  }, [q, router]);
  return null;
}

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg">
      <Spinner className="text-gold" />
      <p className="type-body text-[14px] text-text2">Back to Vibe…</p>
      <Suspense>
        <Return />
      </Suspense>
    </div>
  );
}
