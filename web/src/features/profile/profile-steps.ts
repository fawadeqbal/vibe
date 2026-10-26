import type { Profile } from "@/lib/models";

export interface Step {
  id: "photo" | "bio" | "interests" | "intent";
  label: string;
  done: boolean;
  /** The button when this is the next thing to do. */
  action: string;
  href: string;
}

/** The four parts of a full profile, in the order worth doing them. */
export function profileSteps(me: Profile): Step[] {
  const picked = Math.min(3, me.interests.length);
  return [
    { id: "photo", label: "Photo", done: me.avatarUrl.length > 0, action: "Add a photo", href: "/me/edit#photo" },
    { id: "bio", label: "Bio", done: me.bio.trim().length > 0, action: "Write a line about you", href: "/me/edit#bio" },
    {
      id: "interests",
      label: `Interests ${picked}/3`,
      done: me.interests.length >= 3,
      action: !me.interests.length ? "Pick 3 interests" : 3 - picked === 1 ? "Pick 1 more interest" : `Pick ${3 - picked} more interests`,
      href: "/me/edit#interests",
    },
    { id: "intent", label: "Here for", done: me.intent != null, action: "Say what you're here for", href: "/me/edit#intent" },
  ];
}
