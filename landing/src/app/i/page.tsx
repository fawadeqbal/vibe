import type { Metadata } from "next";

import { InviteCard } from "@/components/invite/invite-card";
import { site } from "@/lib/site";

/**
 * `/i/<CODE>` invite links. One static page: nginx serves it for every code
 * (see nginx.conf) and the page reads the code from the address. Not for
 * search engines (robots.txt also disallows /i/).
 */
export const metadata: Metadata = {
  title: `You're invited to ${site.name}`,
  description: `A friend invited you to ${site.name}: free random video chat with real, selfie-verified people. Join with their link and get free coins.`,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  alternates: { canonical: null },
  openGraph: { title: `You're invited to ${site.name}`, description: `Free video chat with real, verified people. Join with this link and get free coins.`, url: "/i/" },
};

export default function InvitePage() {
  return <InviteCard />;
}
