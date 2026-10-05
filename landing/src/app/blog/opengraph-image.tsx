import { ogImage, ogSize } from "@/lib/og";
import { site } from "@/lib/site";

export const dynamic = "force-static";
export const alt = `${site.name} blog`;
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ kicker: `${site.name} blog`, title: "Guides for meeting people on camera", subtitle: "Safety tips · Conversation starters · Earning" });
}
