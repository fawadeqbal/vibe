import { site } from "@/lib/site";

const n = site.name;

/** Home page FAQ (also its FAQPage schema). Written around what people actually search. */
export const FAQS: { q: string; a: string }[] = [
  { q: `Is ${n} free?`, a: "Yes — downloading, matching and chatting are free. Coins (for gifts and boosts) and VIP are optional." },
  {
    q: `Is ${n} a good Omegle alternative?`,
    a: `Omegle closed in November 2023. ${n} keeps the part people loved — one tap to a random video chat with someone new — and adds what Omegle never had: selfie-verified profiles, calls that start blurred, two-tap reporting reviewed 24/7, and 18+ only.`,
  },
  { q: "How does verification work?", a: "A quick selfie check compares you to your profile photo. Verified people get a teal badge, and you can choose to match with verified people only." },
  { q: "What happens when I report someone?", a: "The call ends for you instantly, the report goes to our moderation team with call context, and repeat offenders are removed. Reports are reviewed 24/7." },
  { q: "Can I choose who I match with?", a: "Yes. In video match you can filter by gender and country; in Discover by age, gender, country, online now and verified only. Age is always free, every filter is free during the daily Vibe Hour and with VIP, and otherwise filters cost a few coins." },
  {
    q: `What is Discover on ${n}?`,
    a: "Discover is the swipe side of the app: real, active people one at a time. Like or pass; when two people like each other it's a match and the chat opens. Likes are free every day, and VIP gets unlimited likes and sees who liked them.",
  },
  {
    q: "Can someone video call me without my permission?",
    a: "No. Video calls from a chat stay off until both of you tap Allow, and either person can turn them off again at any time. Missed and finished calls show in the chat. Random video match is separate and always starts blurred.",
  },
  {
    q: `Can I use ${n} on my computer?`,
    a: `Yes. ${n} runs in any modern browser on a laptop or desktop — no download needed — and as an app on Android phones. Your account, coins and friends are the same on both.`,
  },
  {
    q: `Does ${n} work in Pakistan?`,
    a: "Yes. You can match with people in Pakistan or worldwide, buy coins in PKR with JazzCash, Easypaisa, card or bank transfer, and cash out your gems to a JazzCash or Easypaisa wallet or a bank account.",
  },
  { q: "What are coins and gems?", a: "Coins are what you spend on gifts, boosts and filters. When someone receives a gift, half its value becomes gems they can cash out." },
  {
    q: "How do I buy coins, and in what currency?",
    a: "On Google Play and the App Store you pay in USD through the store. Direct downloads can also pay in PKR with JazzCash, Easypaisa, card or bank transfer — wallet payments are approved right in your JazzCash or Easypaisa app.",
  },
  {
    q: "How does inviting friends work?",
    a: "Share your invite link from the app. Your friend gets 50 coins and you get 100 once they've verified their profile and had 3 calls — it all happens automatically. Bring 3, 10 and 25 friends to unlock free VIP and bonus coins.",
  },
  {
    q: "How do cash-outs work?",
    a: "Add a JazzCash or Easypaisa number or an IBAN in your wallet, request a cash-out, and track it live from Requested to Paid. Account numbers are stored encrypted, and larger monthly amounts ask for a quick selfie verification first.",
  },
];
