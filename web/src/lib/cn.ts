import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the custom type roles so `type-title` and
// `type-display` replace each other instead of stacking.
const merge = extendTailwindMerge<"vibe-type">({
  extend: {
    theme: { radius: ["card"] },
    classGroups: {
      "vibe-type": ["type-display", "type-title", "type-title-lg", "type-body", "type-label", "type-number", "type-number-lg", "type-overline", "type-serif", "type-mono"],
    },
  },
});

/** Class names, conditionally joined, with Tailwind conflicts resolved. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
