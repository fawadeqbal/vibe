import type { IconVariant } from "@/components/ui/icon";

/** The glyph for a sign-in provider (sign-in buttons, sign-in methods card). */
export function providerIcon(provider: string): { name: string; variant?: IconVariant } {
  switch (provider) {
    case "google":
      return { name: "g_mobiledata" };
    case "apple":
      return { name: "apple", variant: "filled" };
    case "facebook":
      return { name: "facebook" };
    default:
      return { name: "login" };
  }
}
