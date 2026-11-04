/**
 * What every number on the Marketing site page means — written once, shown
 * on hover. The counting itself lives in the database views
 * (backend/prisma/migrations/20261106090000_analytics_views); keep these
 * sentences in step with them.
 */
export const DEFINITIONS = {
  visitors: "Different browsers. One person on a phone and a laptop counts twice; so does a TikTok or Instagram in-app browser.",
  visits: "One browser on the site, ending after 30 minutes with nothing happening. Your own visits don't count once you've pressed “Ignore my visits”. Bots and link previews are dropped.",
  engaged: "Visits that read 2+ pages, stayed 10+ seconds, or clicked to the app.",
  clicked: "Visits that pressed any button into the web app or the Android download.",
  downloaded: "Visits that went on to the counted Android download.",
  signups: "Visits that ended in a new account (test bots and staff accounts left out).",
  firstCall: "Of those sign-ups: had at least one random video call with a real person (calls with test bots don't count).",
  goodFirstCall: "Of those sign-ups: a random call of 60 seconds or more with a real person within 48 hours of signing up — the same “good first call” as the Dashboard.",
  paid: "Of those sign-ups: at least one successful purchase that wasn't refunded and didn't go through a test gateway (dev card, dev wallet).",
} as const;

export type DefinitionKey = keyof typeof DEFINITIONS;
