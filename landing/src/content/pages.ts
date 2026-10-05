import type { KeywordPage } from "@/content/types";
import { site } from "@/lib/site";

/*
 * Search-intent landing pages, one per thing people type into Google.
 * Each page answers its query in the first paragraph, then goes deeper.
 * Every product claim here must stay true: if the app changes, change the copy.
 */
const n = site.name;
const app = site.links.webApp;

export const PAGES: KeywordPage[] = [
  // ── 1 ────────────────────────────────────────────────────────────────────
  {
    slug: "omegle-alternative",
    navLabel: "Omegle alternative",
    title: "Best Omegle Alternative: Safe Random Video Chat",
    description: `Omegle shut down in 2023. ${n} brings back one-tap random video chat — with selfie-verified people, calls that start blurred and 24/7 moderation. Free, 18+.`,
    keywords: ["omegle alternative", "sites like omegle", "omegle replacement", "apps like omegle", "new omegle", "omegle video chat"],
    kicker: "Omegle alternative",
    h1: "The Omegle alternative that keeps the spark and fixes the rest",
    lede: `Omegle closed for good on 8 November 2023. If you miss pressing one button and meeting a total stranger on camera, ${n} is built for exactly that moment — free, in your browser or on Android — with the safety Omegle never had: selfie-verified profiles, video that starts blurred, and reports reviewed around the clock.`,
    blocks: [
      { h2: "What people loved about Omegle" },
      {
        p: "For fourteen years Omegle did one thing: it put you in a conversation with someone you'd never otherwise meet. No profile, no feed, no followers. A student in Lahore could end up talking to a nurse in Manila or a musician in Lisbon within seconds. That randomness — and the stories that came out of it — is why people still search for it today.",
      },
      {
        p: `${n} keeps that core loop untouched. You tap **Start**, you're connected live with a real person, and if the spark isn't there you tap **Next**. No swiping through photos first, no waiting for a match to reply.`,
      },
      { h2: "What Omegle got wrong — and what we do instead" },
      {
        p: "Omegle was anonymous by design, which meant nobody was accountable. Its founder's closing letter described a constant fight against misuse that had become impossible to win. We started from the opposite end: make safety the default, so the fun part can stay random.",
      },
      {
        table: {
          head: ["", "Omegle (closed 2023)", n],
          rows: [
            ["Real people", "Anyone, fully anonymous", "Selfie verification with a visible badge; match with verified people only if you like"],
            ["First seconds of a call", "Full video instantly", "Both videos start blurred, then sharpen"],
            ["Reporting", "Limited", "Report button always on screen, reviewed 24/7; repeat offenders removed"],
            ["Age", "18+, or 13+ with parental permission", "18+ only, always"],
            ["Choose who you meet", "Interest tags", "Gender and country filters"],
            ["After a good call", "Gone forever", "Add each other as friends and keep chatting"],
            ["Price", "Free", "Free; optional coins and VIP"],
          ],
          caption: "Omegle details from its public history; it no longer operates.",
        },
      },
      { h2: "How to start your first video chat" },
      {
        ol: [
          `Open [${n} in your browser](${app}) or install the Android app — no download is needed on a computer.`,
          "Sign in and add a profile photo. Take the quick selfie check to get your verified badge (it also unlocks matching with verified people only).",
          "Allow camera and microphone, tap **Start**, and say hi. Tap **Next** any time to meet someone else.",
        ],
      },
      { cta: { title: "Try the Omegle alternative now", body: "One tap, a real person on the other side. Free to match, 18+ only." } },
      { h2: "More than a replacement" },
      {
        p: `Omegle conversations ended the moment someone clicked away. On ${n}, a good call can turn into a friendship: add each other and the conversation moves to chat. You can also send live gifts mid-call — and when someone sends you one, half its value becomes gems you can [cash out as real money](/earn-money-video-chat/).`,
      },
      {
        p: `Curious how we compare with other options? Read our guide on [how to choose a random video chat app](/blog/how-to-choose-a-random-video-chat-app/), or see [what actually happened to Omegle](/blog/what-happened-to-omegle/).`,
      },
    ],
    faqs: [
      { q: "Is Omegle still working?", a: "No. Omegle shut down permanently on 8 November 2023 and its website now shows only a farewell letter from its founder. Sites that claim to be 'the new Omegle' are unrelated to it." },
      { q: `Is ${n} like Omegle?`, a: `Yes, in the way that matters: one tap connects you to a random person on live video, and Next takes you to someone else. Unlike Omegle, ${n} has selfie verification, calls that start blurred, 24/7 moderation and is strictly 18+.` },
      { q: `Is ${n} free?`, a: "Yes. Matching and chatting are free. Coins (for gifts, boosts and filters) and VIP are optional." },
      { q: "Do I need to download anything?", a: `No. ${n} works in any modern browser on a computer or phone. There's also an Android app if you prefer.` },
    ],
    related: ["/random-video-chat/", "/chatroulette-alternative/", "/blog/what-happened-to-omegle/", "/safe-video-chat/"],
    updated: "2026-10-05",
  },

  // ── 2 ────────────────────────────────────────────────────────────────────
  {
    slug: "random-video-chat",
    navLabel: "Random video chat",
    title: "Random Video Chat — Free, Live & Verified",
    description: `Free random video chat with real, selfie-verified people worldwide. One tap to connect, one tap to skip, filters by country and gender. Try ${n} in your browser.`,
    keywords: ["random video chat", "random video call", "free random video chat", "video chat random people", "random cam chat", "random chat app"],
    kicker: "Random video chat",
    h1: "Random video chat with real people, one tap away",
    lede: `${n} connects you face to face with a random person somewhere in the world the moment you tap Start. Stay if you click, skip if you don't. It's free, it works in your browser and on Android, and every call has safety built in from the first second.`,
    blocks: [
      { h2: "How random video chat works on " + n },
      {
        p: "There's no profile to fill in before you can talk and no waiting for someone to like you back. We pair you with whoever is looking for a conversation right now, in real time, over a direct peer-to-peer video connection.",
      },
      {
        ul: [
          "**Tap Start** — you're matched live, usually within seconds.",
          "**Talk or skip** — no spark? Next is one tap. A good one? Send a like or a gift, or just keep talking.",
          "**Stay in touch** — add each other as friends and continue in chat after the call ends.",
        ],
      },
      { h2: "Random, but on your terms" },
      {
        p: "Pure randomness is the fun part, but you decide how random. Filter by **gender** and **country** when you want to meet someone specific — filters cost a few coins on the free plan and are unlimited with VIP. Want only real, checked people? Turn on **verified only** and you'll match exclusively with people who passed the selfie check.",
      },
      { h2: "Safety that's on before you are" },
      {
        p: "Talking to strangers only works when it feels safe, so the guardrails are on by default — you opt out, not in.",
      },
      {
        ul: [
          "**Calls start blurred.** Both videos stay soft for the first seconds, so nobody is caught off guard.",
          "**Selfie-verified badges.** A quick check confirms there's a real person behind the profile photo.",
          "**Two-tap reporting.** The report button never leaves the screen; reports are reviewed 24/7.",
          "**18+ only.** No exceptions.",
        ],
      },
      { note: `See every protection in detail on our [safe video chat](/safe-video-chat/) page, and read our [12 safety tips for video chat with strangers](/blog/video-chat-safety-tips/).` },
      { h2: "Works on any device" },
      {
        p: `Use ${n} on a laptop or desktop straight from the browser — Chrome, Edge, Firefox and Safari all work — or on an Android phone with the app. Your coins, friends and verified badge follow you everywhere. Read more about [video chat online with no download](/video-chat-online/).`,
      },
      { cta: { title: "Start a random video chat", body: "Someone's online right now. Free to match, 18+." } },
      { h2: "Make it worth their while" },
      {
        p: `Gifts land on screen with full-screen effects you both see — from a 5-coin rose to a 1,000-coin rocket. When you receive one, half its value turns into gems you can [cash out to JazzCash, Easypaisa or your bank](/earn-money-video-chat/).`,
      },
    ],
    faqs: [
      { q: "Is random video chat free?", a: `On ${n}, yes. Matching, video and chat are free. Coins are optional and only needed for gifts, boosts and filters.` },
      { q: "Can I choose who I get matched with?", a: "Yes. You can filter by gender and country, and choose to match with selfie-verified people only." },
      { q: "Is random video chat safe?", a: `It depends on the app. ${n} starts every call blurred, verifies people with a selfie check, keeps a report button on screen and reviews reports 24/7. It's 18+ only.` },
      { q: "How fast will I get matched?", a: "Usually within a few seconds — the hero on our home page shows how many people are online right now." },
    ],
    related: ["/talk-to-strangers/", "/omegle-alternative/", "/video-chat-online/", "/blog/conversation-starters-for-video-chat/"],
    updated: "2026-10-05",
  },

  // ── 3 ────────────────────────────────────────────────────────────────────
  {
    slug: "talk-to-strangers",
    navLabel: "Talk to strangers",
    title: "Talk to Strangers on Video — Free & Safe",
    description: `Talk to strangers on live video with ${n}: real, selfie-verified people from around the world, blurred call starts and 24/7 moderation. Free, 18+.`,
    keywords: ["talk to strangers", "talk to strangers online", "video chat with strangers", "chat with strangers", "meet strangers online", "stranger video call"],
    kicker: "Talk to strangers",
    h1: "Talk to strangers — and actually enjoy it",
    lede: `Want to talk to someone new tonight? ${n} matches you on live video with a stranger anywhere in the world in one tap. Everyone is 18+, calls start blurred, and verified badges show you who's real — so the only surprise is how good the conversation gets.`,
    blocks: [
      { h2: "Why people love talking to strangers" },
      {
        p: "Research on everyday conversations keeps finding the same thing: people expect talking to a stranger to be awkward, and then enjoy it far more than they predicted. A stranger has no history with you, no expectations and no group chat to report back to. That's freeing. You can practise English, swap music, hear what life is like in another country, or just laugh with someone at 1 a.m.",
      },
      { h2: "How to talk to strangers on " + n },
      {
        ol: [
          `Open [${n}](${app}) in your browser or the Android app and sign in.`,
          "Set your filters if you want — a country, a gender, or verified people only.",
          "Tap **Start**. Say hello while the video sharpens. If the vibe's off, tap **Next**.",
          "Had a great chat? Tap **Add friend** so the conversation doesn't end with the call.",
        ],
      },
      { h2: "What makes a stranger safe to talk to?" },
      {
        p: "Anonymity is what made older stranger-chat sites risky. We still let you meet anyone, but nobody is unaccountable:",
      },
      {
        ul: [
          "Selfie verification ties a real face to every verified profile.",
          "Video starts blurred, so you have a moment before anyone is fully visible.",
          "Report in two taps — during or after the call. The call ends for you instantly and moderators review it 24/7.",
          "Strictly 18+. Accounts that break the rules are removed.",
        ],
      },
      { note: "Never share your phone number, address, school, workplace or financial details with someone you've just met — on any app. More in our [safety tips](/blog/video-chat-safety-tips/)." },
      { cta: { title: "Say hi to someone new", body: "Real people, live video, one tap. Free and 18+." } },
      { h2: "Not sure what to say?" },
      {
        p: "Start with where they are — it's the easiest question in the world and the answer is always interesting. Then ask what they were doing before the call. We collected 40 more openers in [conversation starters for video chat](/blog/conversation-starters-for-video-chat/).",
      },
    ],
    faqs: [
      { q: "Where can I talk to strangers online for free?", a: `${n} lets you talk to strangers on live video for free in your browser or on Android. Coins and VIP are optional.` },
      { q: "Is it safe to talk to strangers on video?", a: `It's safest on apps that verify people and moderate calls. ${n} uses selfie verification, blurred call starts, an always-visible report button and 24/7 review, and it's 18+ only.` },
      { q: "Can I talk to strangers from a specific country?", a: "Yes — use the country filter. It costs a few coins on the free plan and is unlimited with VIP." },
    ],
    related: ["/random-video-chat/", "/safe-video-chat/", "/blog/conversation-starters-for-video-chat/", "/blog/make-friends-online-pakistan/"],
    updated: "2026-10-05",
  },

  // ── 4 ────────────────────────────────────────────────────────────────────
  {
    slug: "chatroulette-alternative",
    navLabel: "Chatroulette alternative",
    title: "Chatroulette Alternative With Verified People",
    description: `Looking for a Chatroulette alternative? ${n} is free one-tap video chat with selfie-verified people, blurred call starts, country filters and 24/7 moderation.`,
    keywords: ["chatroulette alternative", "sites like chatroulette", "apps like chatroulette", "chat roulette", "video roulette", "roulette video chat"],
    kicker: "Chatroulette alternative",
    h1: "A Chatroulette alternative where you know who's on the other side",
    lede: `Chatroulette made "video roulette" famous in 2010: spin, meet a stranger, spin again. ${n} keeps the roulette — one tap to connect, one tap for next — and adds what most roulette sites skip: selfie verification, video that starts blurred, and a moderation team on 24/7.`,
    blocks: [
      { h2: "The roulette, minus the roulette of who you'll see" },
      {
        p: "The thrill of video roulette is not knowing who you'll meet. The problem with it has always been not knowing *what* you'll see. Our answer is to keep the first part random and take the gamble out of the second.",
      },
      {
        ul: [
          "**Calls start blurred** for both people, then sharpen after a few seconds.",
          "**Verified only** mode matches you exclusively with people who passed a selfie check.",
          "**Report in two taps** at any point; the call ends for you immediately.",
          "**18+ only** and moderated around the clock.",
        ],
      },
      { h2: "What to look for in any Chatroulette alternative" },
      {
        p: "Whatever you end up using, check these before you turn on your camera:",
      },
      {
        ol: [
          "Is there any kind of verification, or can anyone appear?",
          "Can you report someone *during* the call, and does anyone actually review reports?",
          "Does the app say clearly that it's adults only?",
          "Does it work without installing unknown software on your computer?",
          "Is the pricing clear — what's free, what costs money?",
        ],
      },
      { p: `We wrote a longer checklist in [how to choose a random video chat app](/blog/how-to-choose-a-random-video-chat-app/).` },
      { cta: { title: "Spin up a conversation", body: "Free one-tap video chat with real people. 18+." } },
      { h2: "Filters when you want them" },
      {
        p: "Pure roulette is fun; sometimes you want to tilt the wheel. Filter by country to practise a language or meet people from a place you're curious about, or by gender. Filters cost coins on the free plan and are unlimited with VIP.",
      },
    ],
    faqs: [
      { q: `Is ${n} the same as Chatroulette?`, a: `No, ${n} is a separate app. It works in a similar one-tap way, with added selfie verification, blurred call starts and 24/7 moderation.` },
      { q: "Is there a free Chatroulette alternative?", a: `${n} is free to use: matching, video and chat cost nothing. Optional coins pay for gifts, boosts and filters.` },
      { q: "Does it work on my phone?", a: `Yes — in your phone's browser, or with the ${n} Android app.` },
    ],
    related: ["/omegle-alternative/", "/random-video-chat/", "/blog/how-to-choose-a-random-video-chat-app/", "/safe-video-chat/"],
    updated: "2026-10-05",
  },

  // ── 5 ────────────────────────────────────────────────────────────────────
  {
    slug: "video-chat-pakistan",
    navLabel: "Video chat in Pakistan",
    title: "Video Chat in Pakistan — Meet New People Live",
    description: `Free live video chat for Pakistan: meet people in Lahore, Karachi, Islamabad or worldwide. Pay in PKR with JazzCash or Easypaisa and cash out your gifts. 18+.`,
    keywords: ["video chat pakistan", "pakistan video call app", "online video chat pakistan", "pakistani video chat", "meet new people pakistan", "random video chat pakistan", "video call app pakistan"],
    kicker: "Video chat in Pakistan",
    h1: "Video chat in Pakistan — with Pakistan, or the whole world",
    lede: `${n} is a free video chat app that works the way Pakistan does: match with people from Lahore, Karachi, Islamabad and across the country, or open it up to the world. Buy coins in rupees with JazzCash, Easypaisa, card or bank transfer — and cash out the gifts you receive straight to your wallet.`,
    blocks: [
      { h2: "Meet people near you or across the world" },
      {
        p: "Use the **country filter** to match with people in Pakistan — great when you want to talk in Urdu, Punjabi, Sindhi or Pashto, or with someone who gets the same jokes. Turn it off to meet people from everywhere else: practise your English, hear about life abroad, or make friends in a city you hope to visit.",
      },
      { h2: "Pay in PKR, the way you already pay" },
      {
        table: {
          head: ["Method", "Currency", "How it works"],
          rows: [
            ["JazzCash", "PKR", "Approve the payment in your JazzCash app"],
            ["Easypaisa", "PKR", "Approve the payment in your Easypaisa app"],
            ["Debit / credit card", "PKR", "Secure hosted card page"],
            ["Bank transfer", "PKR", "Transfer and the coins land once it's confirmed"],
            ["Google Play", "USD", "Through the Play Store"],
          ],
          caption: "PKR methods are available on the web app and the direct Android download. Every purchase is verified with the provider before coins land.",
        },
      },
      { h2: "Get paid for good conversations" },
      {
        p: `People send gifts when a call is going well. You keep half of every gift's value as **gems**, and gems can be cashed out to a JazzCash or Easypaisa number or a bank account (IBAN). You can track each cash-out from Requested to Paid, account numbers are stored encrypted, and larger monthly amounts ask for a quick selfie check first. See the full guide: [how to cash out to JazzCash and Easypaisa](/blog/cash-out-jazzcash-easypaisa/).`,
      },
      { cta: { title: "Start video chatting in Pakistan", body: "Free to match. Pay and get paid in PKR. 18+ only." } },
      { h2: "Safe by default" },
      {
        ul: [
          "Every call starts blurred for a few seconds.",
          "Selfie-verified badges — and a verified-only mode.",
          "Report in two taps; moderators review reports 24/7 and remove repeat offenders.",
          "18+ only, always.",
        ],
      },
      { p: `Looking for friendship rather than a quick chat? Read [how to make friends online in Pakistan](/blog/make-friends-online-pakistan/).` },
      { h2: "Light on data, works on any phone" },
      {
        p: `${n} runs in your phone's browser or as an Android app, on Wi-Fi or mobile data. Video adapts to your connection, so a call keeps going on 4G even when the signal dips.`,
      },
    ],
    faqs: [
      { q: "Which video chat app is best in Pakistan?", a: `Look for one that lets you pay in PKR, verifies people and moderates calls. ${n} supports JazzCash, Easypaisa, card and bank transfer, uses selfie verification and blurred call starts, and is 18+ only.` },
      { q: `Can I pay for ${n} with JazzCash or Easypaisa?`, a: "Yes. On the web app and the direct Android download you can buy coins in PKR with JazzCash, Easypaisa, card or bank transfer. Google Play purchases are in USD." },
      { q: "Can I earn money from video chat in Pakistan?", a: "Yes. Half the value of every gift you receive becomes gems, which you can cash out to JazzCash, Easypaisa or a bank account." },
      { q: "Can I only match with people from Pakistan?", a: "Yes — set the country filter to Pakistan. Filters cost a few coins on the free plan and are unlimited with VIP." },
    ],
    related: ["/earn-money-video-chat/", "/blog/cash-out-jazzcash-easypaisa/", "/blog/make-friends-online-pakistan/", "/random-video-chat/"],
    updated: "2026-10-05",
  },

  // ── 6 ────────────────────────────────────────────────────────────────────
  {
    slug: "earn-money-video-chat",
    navLabel: "Earn money from video chat",
    title: "Earn Money From Video Chat — Gifts to Real Cash",
    description: `Earn real money from video chat on ${n}: gifts you receive become gems, and gems cash out to JazzCash, Easypaisa or your bank. Free to join, 18+.`,
    keywords: ["earn money video chat", "video chat earn money app", "earn money online pakistan", "get paid to video chat", "video call earning app", "earn money jazzcash"],
    kicker: "Gifts & earnings",
    h1: "Earn money from video chat — gifts become gems, gems become cash",
    lede: `On ${n}, people send gifts when a conversation is good. Every gift you receive turns half its value into gems, and gems cash out as real money to JazzCash, Easypaisa or a bank account. No follower count needed — just good conversations.`,
    blocks: [
      { h2: "How earning works" },
      {
        ol: [
          "**Someone sends you a gift** mid-call — a 5-coin rose, 100-coin fireworks, a 1,000-coin rocket.",
          "**You keep 50% of its value as gems.** Gems collect in your wallet, and the live rate is always shown there.",
          "**Cash out** to a JazzCash or Easypaisa number or an IBAN, and follow it from Requested to Paid.",
        ],
      },
      { note: "Earnings depend entirely on the gifts people choose to send. There's no fixed salary and no guaranteed income — anyone promising that on any app is selling something." },
      { h2: "What makes people send gifts" },
      {
        ul: [
          "**Good lighting and a clear face.** Sit facing a window or a lamp, not with it behind you.",
          "**Questions, not monologues.** People reward conversations where they feel listened to.",
          "**A verified badge.** Many people only match with verified profiles — take the selfie check.",
          "**Show up regularly.** Friends you've added can find you again, and returning friends gift more.",
          "**Say thank you** when a gift lands — on screen, out loud. It matters.",
        ],
      },
      { p: `Need openers? Try our [40 conversation starters for video chat](/blog/conversation-starters-for-video-chat/).` },
      { cta: { title: "Start earning from your conversations", body: "Free to join. Get your verified badge and start a call." } },
      { h2: "Getting paid, safely" },
      {
        p: `Payout accounts are stored encrypted. Larger monthly cash-outs ask for a quick selfie verification so nobody else can withdraw your gems. Step-by-step instructions are in [how to cash out to JazzCash and Easypaisa](/blog/cash-out-jazzcash-easypaisa/).`,
      },
      { h2: "Free coins, too" },
      {
        p: "Not everything is about cash. Daily check-ins, completing your profile and inviting friends all pay out free coins — invite a friend and you both get 100 coins once they finish their profile.",
      },
    ],
    faqs: [
      { q: "Can you really earn money from video chat?", a: `Yes, on apps with a gifts economy. On ${n}, 50% of every gift's value becomes gems that you can cash out. Income depends on the gifts people send — it isn't guaranteed.` },
      { q: "How do I withdraw my earnings?", a: "Add a JazzCash or Easypaisa number or an IBAN in your wallet, request a cash-out and track it live until it's paid." },
      { q: "Is there a minimum age?", a: `Yes. ${n} is 18+ only, for earning and for everything else.` },
    ],
    related: ["/blog/cash-out-jazzcash-easypaisa/", "/video-chat-pakistan/", "/blog/conversation-starters-for-video-chat/", "/random-video-chat/"],
    updated: "2026-10-05",
  },

  // ── 7 ────────────────────────────────────────────────────────────────────
  {
    slug: "safe-video-chat",
    navLabel: "Safe video chat",
    title: "Safe Video Chat With Strangers — How We Protect You",
    description: `How ${n} keeps video chat with strangers safe: selfie verification, calls that start blurred, two-tap reporting reviewed 24/7, encrypted payouts and 18+ only.`,
    keywords: ["safe video chat", "safe video chat with strangers", "safe random video chat", "secure video chat app", "verified video chat", "safe omegle alternative"],
    kicker: "Safety",
    h1: "Safe video chat with strangers, built in from the first second",
    lede: `Meeting strangers on camera only works when it feels safe. On ${n} the protections are on by default — every call starts blurred, verified badges show who's real, and the report button never leaves the screen. Here's exactly how each one works.`,
    blocks: [
      { h2: "1. Selfie verification" },
      {
        p: "A quick selfie check compares you to your profile photo. Pass it and you get a teal verified badge that other people see during the call. You can switch on **verified only** to match exclusively with people who've done the same.",
      },
      { h2: "2. Calls start blurred" },
      {
        p: "For the first seconds of every call both videos are softly blurred, then sharpen. It gives both of you a moment to see the other person's intent before anyone is fully visible — the most important seconds of any call with a stranger.",
      },
      { h2: "3. Report in two taps — during or after" },
      {
        p: "The report button is always on screen. Reporting ends the call for you instantly and sends it to our moderation team with call context. Reports are reviewed 24/7 and repeat offenders are removed.",
      },
      { h2: "4. 18+ only" },
      { p: `${n} is for adults. Accounts that break the age rule are removed.` },
      { h2: "5. Your money and data" },
      {
        ul: [
          "Every coin purchase is verified with the payment provider before coins land.",
          "Payout account numbers (JazzCash, Easypaisa, IBAN) are stored encrypted.",
          "Larger monthly cash-outs need a selfie check, so a stolen login can't drain your gems.",
          "Video travels over encrypted WebRTC connections.",
        ],
      },
      { cta: { title: "Video chat with guardrails on", body: "Safe by default — you opt out, not in. Free, 18+." } },
      { h2: "Your part: a few habits that help" },
      {
        p: "No app can do it all. Keep personal details (phone number, address, school, workplace, social handles) to yourself until you really know someone, and never send money to someone you've met online. Our [12 video chat safety tips](/blog/video-chat-safety-tips/) cover the rest.",
      },
    ],
    faqs: [
      { q: `Is ${n} safe?`, a: `${n} is designed for safety by default: selfie verification, blurred call starts, an always-visible report button, 24/7 moderation and an 18+ rule. Like on any platform, keep personal details private.` },
      { q: "What happens when I report someone?", a: "The call ends for you instantly, the report goes to the moderation team with call context, and repeat offenders are removed. Reports are reviewed 24/7." },
      { q: "Can I only match with verified people?", a: "Yes. Turn on verified-only matching and you'll only meet people who passed the selfie check." },
    ],
    related: ["/blog/video-chat-safety-tips/", "/talk-to-strangers/", "/omegle-alternative/", "/blog/how-to-choose-a-random-video-chat-app/"],
    updated: "2026-10-05",
  },

  // ── 8 ────────────────────────────────────────────────────────────────────
  {
    slug: "video-chat-online",
    navLabel: "Video chat online (no download)",
    title: "Free Video Chat Online — No Download Needed",
    description: `Video chat online for free, right in your browser — no download, no install. Meet real, verified people on ${n} from any laptop, desktop or phone. 18+.`,
    keywords: ["video chat online", "free video chat online", "video chat no download", "online video call with strangers", "browser video chat", "video chat website"],
    kicker: "Video chat online",
    h1: "Free video chat online — straight from your browser",
    lede: `No app store, no installer, no plug-ins. Open ${n} in Chrome, Edge, Firefox or Safari, allow your camera, and you're one tap from a live video chat with someone new. Prefer your phone? It works there too, or grab the Android app.`,
    blocks: [
      { h2: "Start in under a minute" },
      {
        ol: [
          `Go to [${site.links.webApp.replace(/^https?:\/\//, "")}](${app}).`,
          "Sign in and add a profile photo.",
          "Allow camera and microphone when your browser asks.",
          "Tap **Start**.",
        ],
      },
      { h2: "Why browser video chat is good now" },
      {
        p: "Modern browsers have WebRTC built in — the same technology behind most video calling services — so a website can connect two cameras directly, with encryption, and without installing anything. That means fewer permissions, nothing running in the background, and nothing to uninstall.",
      },
      { h2: "Everything the app does, on the web" },
      {
        ul: [
          "One-tap random matching with gender and country filters",
          "Selfie verification, blurred call starts, two-tap reporting",
          "Live gifts, friends and chat after the call",
          "Wallet, cash-outs and coin purchases (JazzCash, Easypaisa, card, bank)",
          "VIP: unlimited filters, no ads, priority matching",
        ],
      },
      { cta: { title: "Open video chat in your browser", body: "Nothing to install. Free to match, 18+." } },
      { h2: "Camera not working?" },
      {
        ul: [
          "Click the camera icon in your address bar and choose **Allow**.",
          "Close other apps that might be using the camera (Zoom, Teams, Meet).",
          "On a work or school computer, camera access may be blocked by an administrator.",
          "Still stuck? Try another browser — Chrome and Edge are the most reliable.",
        ],
      },
    ],
    faqs: [
      { q: "Can I video chat with strangers without downloading an app?", a: `Yes. ${n} runs fully in your browser on a computer or phone. An Android app is available if you prefer one.` },
      { q: "Which browsers are supported?", a: "Recent versions of Chrome, Edge, Firefox and Safari." },
      { q: "Is the browser version free?", a: "Yes — same as the app. Matching and chatting are free; coins and VIP are optional." },
    ],
    related: ["/random-video-chat/", "/omegle-alternative/", "/talk-to-strangers/", "/safe-video-chat/"],
    updated: "2026-10-05",
  },
];

export const pageBySlug = (slug: string) => PAGES.find((p) => p.slug === slug);
