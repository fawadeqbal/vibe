/** The "See all" lists of the Marketing site page (a plain module: the route reads it on the server). */
export const LISTS = {
  channels: { title: "All channels", description: "Every place visitors came from, best results first." },
  campaigns: { title: "All campaigns", description: "Every tagged link (?utm_campaign=…) people used." },
  pages: { title: "All landing pages", description: "The first page of each visit, most visited first." },
  buttons: { title: "All buttons", description: "Every button pressed, with the sign-ups it got." },
  countries: { title: "All countries and cities", description: "Where visitors are, with their regions." },
} as const;
export type ListKind = keyof typeof LISTS;
