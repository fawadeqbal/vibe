import type { Post } from "@/content/types";
import { site } from "@/lib/site";

/*
 * Blog: long-tail guides that earn links and answer real questions.
 * Add a post = add an object here (newest first). It gets its own page,
 * share image, BlogPosting schema, sitemap entry and RSS item automatically.
 */
const n = site.name;

export const POSTS: Post[] = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "what-happened-to-omegle",
    title: "What Happened to Omegle? Why It Shut Down and Where People Video Chat Now",
    metaTitle: "What Happened to Omegle? Why It Shut Down",
    description: "Omegle shut down on 8 November 2023 after 14 years. Here's why it closed, what its founder said, and what to look for in an Omegle alternative today.",
    keywords: ["what happened to omegle", "why did omegle shut down", "omegle shut down", "is omegle back", "omegle closed"],
    category: "News",
    published: "2026-10-05",
    excerpt: "Omegle closed in November 2023 after 14 years of random chats. Why it shut down, whether it's coming back, and what to use instead.",
    blocks: [
      { p: "For a whole generation, Omegle was the internet's most unpredictable website. You pressed a button and found yourself talking to a stranger — sometimes for ten seconds, sometimes for three hours. Then, on **8 November 2023**, it was gone. The homepage was replaced by a long letter from its founder and a picture of a gravestone." },
      { h2: "A short history of Omegle" },
      { p: "Omegle was launched in March 2009 by Leif K-Brooks, then 18, from his home in Vermont. It started as text-only chat with a random stranger and added video in 2010. The tagline said it all: *Talk to strangers!* There was no sign-up and no profile — that radical anonymity was the whole point." },
      { p: "Usage surged again during the pandemic, when millions of bored, isolated people went looking for any face to talk to, and clips of Omegle conversations became a genre of their own on YouTube and TikTok." },
      { h2: "Why did Omegle shut down?" },
      { p: "In his closing letter, K-Brooks said that running Omegle had become unsustainable, financially and psychologically. He described years of fighting misuse of the platform and mounting legal pressure, and said that continuing would mean a constant battle he could no longer fight." },
      { p: "Underneath that was a design problem. Total anonymity made Omegle magical, but it also meant nobody was accountable. With no verification and limited moderation, the worst users were free to keep coming back — and the platform faced lawsuits over exactly that." },
      { h2: "Is Omegle coming back?" },
      { p: "No. The original Omegle is closed permanently. Many websites now use the name or a similar logo, but they are not affiliated with the original service. Be careful with any site that claims to be \"the new Omegle\" — check who runs it and what safety features it has before turning on your camera." },
      { h2: "What a better Omegle looks like" },
      { p: "The lesson of Omegle isn't that random video chat is a bad idea. It's that randomness needs guardrails. A good alternative keeps the one-tap magic and adds:" },
      {
        ul: [
          "**Verification**, so you know there's a real adult behind the camera.",
          "**A safer start to every call** — for example, video that starts blurred.",
          "**Reporting that works**: always on screen, and reviewed by real moderators around the clock.",
          "**A strict 18+ rule.**",
          "**A way to keep good connections** instead of losing them forever when the tab closes.",
        ],
      },
      { p: `That's the brief we gave ourselves when building ${n}. Read how it compares on our [Omegle alternative](/omegle-alternative/) page, or use our checklist for [choosing a random video chat app](/blog/how-to-choose-a-random-video-chat-app/).` },
      { cta: { title: `Try ${n} — one tap, real people`, body: "Selfie-verified, calls start blurred, reports reviewed 24/7. Free, 18+." } },
    ],
    faqs: [
      { q: "When did Omegle shut down?", a: "Omegle shut down permanently on 8 November 2023, after about 14 years online." },
      { q: "Why did Omegle shut down?", a: "Its founder, Leif K-Brooks, said operating it had become unsustainable financially and psychologically, citing the ongoing fight against misuse and legal pressure." },
      { q: "Is there a new Omegle?", a: "The original Omegle is not coming back. Sites using its name are unrelated. Look for alternatives with verification, moderation and an 18+ rule." },
    ],
    related: ["/omegle-alternative/", "/blog/how-to-choose-a-random-video-chat-app/", "/safe-video-chat/"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "video-chat-safety-tips",
    title: "12 Safety Tips for Video Chat With Strangers",
    description: "Practical safety tips for random video chat: what to keep private, how to spot scams and sextortion, what to do if something goes wrong, and which app features help.",
    keywords: ["video chat safety tips", "how to stay safe on video chat", "online video chat safety", "random video chat safety", "sextortion video call"],
    category: "Safety",
    published: "2026-10-05",
    excerpt: "Twelve habits that make video chat with strangers safer — from what to keep off camera to how to handle blackmail attempts.",
    blocks: [
      { p: "Talking to strangers on video can be one of the best things on the internet. These twelve habits keep it that way. They apply to every app, including ours." },
      { h2: "Before the call" },
      {
        ol: [
          "**Use an app with real safety features.** Look for verification, an always-visible report button, active moderation and an 18+ rule. On [our safety page](/safe-video-chat/) you can see what we do.",
          "**Check your background.** Remove anything that shows your address, school, workplace, ID cards, mail or a recognisable view from your window.",
          "**Turn on safer matching.** If your app offers it, match with verified people only.",
          "**Use a separate display name.** Avoid your full name or a handle that leads to your other social accounts.",
        ],
      },
      { h2: "During the call" },
      {
        ol: [
          "**Take the first few seconds slowly.** Calls that start blurred give you a moment to see the other person's intent before anyone is fully visible.",
          "**Keep personal details private:** phone number, address, school, workplace, daily routine and social media handles.",
          "**Never do anything on camera you wouldn't want recorded.** Assume anything can be screen-recorded, because it can.",
          "**Skip and report freely.** You owe a stranger nothing. If something feels off, tap Next. If someone breaks the rules, report them — that protects the next person too.",
        ],
      },
      { h2: "After the call" },
      {
        ol: [
          "**Move slowly from app to real life.** Keep chatting in the app's own messages before sharing other contacts, and meet in public if you ever meet at all.",
          "**Never send money** — or gift cards, crypto, or 'fees' — to someone you met online, whatever the story.",
          "**Know the blackmail playbook.** Sextortion usually goes: flirty chat → request to move to another app → explicit request → threat to share a recording unless you pay. Don't pay, stop replying, save evidence, report the account, and tell someone you trust.",
          "**Report outside the app when needed.** Threats or blackmail are crimes. In Pakistan you can report cybercrime to the National Cyber Crime Investigation Agency ([NCCIA](https://www.nccia.gov.pk/), which took over from the FIA Cyber Crime Wing); elsewhere, contact local police.",
        ],
      },
      { note: "If you're being threatened, you're not in trouble and it's not your fault. Paying almost never makes it stop. Stop contact, keep screenshots, report." },
      { h2: `How ${n} helps` },
      {
        ul: [
          "Selfie-verified badges and a verified-only mode",
          "Every call starts blurred",
          "Report in two taps, during or after a call — reviewed 24/7",
          "18+ only; repeat offenders are removed",
          "Encrypted payout details and selfie checks on larger cash-outs",
        ],
      },
      { cta: { title: "Video chat with safety on by default", body: "Real people, guardrails built in. Free, 18+." } },
    ],
    faqs: [
      { q: "Is it safe to video chat with strangers?", a: "It can be, on an app with verification, reporting and moderation — and if you keep personal details private and never send money to people you meet online." },
      { q: "What should I do if someone threatens to share a recording?", a: "Don't pay. Stop replying, save evidence, report the account in the app, tell someone you trust and report it to the cybercrime authority in your country." },
    ],
    related: ["/safe-video-chat/", "/talk-to-strangers/", "/blog/how-to-choose-a-random-video-chat-app/"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "conversation-starters-for-video-chat",
    title: "40 Conversation Starters for Video Chat With Strangers",
    metaTitle: "40 Conversation Starters for Video Chat",
    description: "Never freeze on camera again: 40 conversation starters for random video chat, from easy openers to deeper questions, plus tips to keep the conversation going.",
    keywords: ["conversation starters", "what to say on video chat", "questions to ask strangers", "how to start a conversation online", "video call topics"],
    category: "Guides",
    published: "2026-10-05",
    excerpt: "Forty openers that work on camera — easy ones for the first ten seconds, fun ones, deep ones — and how to keep a chat going.",
    blocks: [
      { p: "The first ten seconds of a random video chat decide whether you get a next ten. The good news: you don't need to be funny. You need to be curious. Here are forty openers, grouped by how far into the conversation you are." },
      { h2: "The first ten seconds" },
      {
        ol: [
          "Hey! Where in the world are you right now?",
          "What time is it there?",
          "What were you doing right before this call?",
          "Is that your room? I like the [poster / plant / lights].",
          "You're my first call today — how's your day going?",
          "Okay, first impression: you look like you'd have good music taste. Prove me right.",
          "What made you open the app tonight?",
          "Can you hear me okay? (Then: where are you from?)",
        ],
      },
      { h2: "Easy and fun" },
      {
        ol: [
          "What's the best thing you ate this week?",
          "What's a song you've had on repeat?",
          "If I visited your city, where should I go first?",
          "What's something people get wrong about your country?",
          "Tea or coffee — and how do you take it?",
          "What are you watching right now?",
          "What's the most random thing in your room?",
          "Cricket, football or neither?",
          "What's your go-to comfort food?",
          "What's a word in your language that doesn't exist in English?",
          "What would your perfect weekend look like?",
          "What's a small thing that made you happy recently?",
        ],
      },
      { h2: "A bit deeper" },
      {
        ol: [
          "What are you working on or studying?",
          "What's something you're really good at that most people don't know?",
          "What's a dream you haven't told many people about?",
          "Where would you live if you could live anywhere?",
          "What's the best advice you've ever been given?",
          "What's something you changed your mind about recently?",
          "Who's the most interesting person you've ever met?",
          "What's a skill you'd love to learn this year?",
          "What do you miss most about being a kid?",
          "What's harder than it looks?",
        ],
      },
      { h2: "To keep it going" },
      {
        ol: [
          "Wait — tell me more about that.",
          "How did you get into that?",
          "What's the story behind [thing in their background]?",
          "Okay, now you ask me something.",
          "Would you rather: travel to the past or the future?",
          "Teach me how to say hello in your language.",
          "Show me the view from your window.",
          "Let's both say our favourite song at the same time — three, two, one.",
          "What should I definitely not miss if I ever visit?",
          "This was fun — want to add each other?",
        ],
      },
      { h2: "Three habits that matter more than any line" },
      {
        ul: [
          "**Ask, then follow up.** The second question (\"how did that happen?\") is where conversations come alive.",
          "**Light your face.** Sit facing a window or lamp. People talk longer to people they can see.",
          "**Skip without guilt.** Not every match is a match. A friendly \"nice meeting you!\" and Next is fine.",
        ],
      },
      { p: `When a call goes really well, a [gift](/earn-money-video-chat/) is a fun way to say so — and if you want to stay in touch, add each other as friends so the chat continues after the call.` },
      { cta: { title: "Put these to the test", body: "Someone new is one tap away. Free, 18+." } },
    ],
    related: ["/talk-to-strangers/", "/random-video-chat/", "/blog/make-friends-online-pakistan/"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "cash-out-jazzcash-easypaisa",
    title: "How to Cash Out Video Chat Earnings to JazzCash, Easypaisa or Bank",
    metaTitle: "Cash Out to JazzCash or Easypaisa: Step by Step",
    description: `Step-by-step: turn gifts into gems and cash out to JazzCash, Easypaisa or a bank account (IBAN) on ${n}. Tracking, security checks and common questions.`,
    keywords: ["cash out jazzcash", "withdraw to easypaisa", "earning app jazzcash withdraw", "earn money app pakistan easypaisa", "video chat earning withdraw"],
    category: "Earning",
    published: "2026-10-05",
    excerpt: "Gifts become gems, gems become rupees. Exactly how to withdraw to JazzCash, Easypaisa or your bank — and what the security checks are for.",
    blocks: [
      { p: `On ${n}, every gift you receive during a call turns half its value into **gems**. Gems are real earnings: you can withdraw them to a JazzCash or Easypaisa mobile wallet, or to any Pakistani bank account with an IBAN. Here's how it works, step by step.` },
      { h2: "Step 1: Earn gems" },
      { p: "When someone sends you a gift — a rose, fireworks, a rocket — 50% of its coin value is added to your gem balance. You'll see the total, and its value in money at the current rate, in your wallet." },
      { h2: "Step 2: Add a payout account" },
      {
        ol: [
          "Open **Wallet** and choose **Cash out**.",
          "Pick **JazzCash**, **Easypaisa** or **Bank (IBAN)**.",
          "Enter the account details exactly as registered — the mobile number linked to your wallet, or your 24-character IBAN starting with PK.",
        ],
      },
      { note: "Account numbers are stored encrypted, and you can only cash out to accounts you've added yourself." },
      { h2: "Step 3: Request the cash-out" },
      { p: "Choose the amount and confirm. You can follow it live as it moves from **Requested** to **Paid**. Wallet payouts are typically the fastest; bank transfers can take longer depending on the bank." },
      { h2: "Why you might be asked for a selfie" },
      { p: "Larger monthly cash-out amounts ask for a quick selfie verification first. It's there to make sure the person withdrawing is the account owner — so even if someone got your password, they couldn't drain your gems." },
      { h2: "JazzCash, Easypaisa or bank: which should you pick?" },
      {
        table: {
          head: ["", "JazzCash", "Easypaisa", "Bank (IBAN)"],
          rows: [
            ["You need", "A JazzCash mobile account", "An Easypaisa mobile account", "A bank account with an IBAN"],
            ["Best for", "Fast payouts to your phone", "Fast payouts to your phone", "Larger amounts, keeping savings in a bank"],
            ["Details to enter", "Registered mobile number", "Registered mobile number", "24-character IBAN (PK…)"],
          ],
        },
      },
      { h2: "Tips to avoid delays" },
      {
        ul: [
          "Make sure the wallet is active and in your own name (CNIC-verified).",
          "Double-check the number or IBAN before saving.",
          "Complete your selfie verification early so larger cash-outs aren't held up.",
        ],
      },
      { h2: "Buying coins with the same wallets" },
      { p: `The same methods work the other way: on the web app and direct Android download you can buy coins in PKR with JazzCash, Easypaisa, card or bank transfer — wallet payments are approved in your JazzCash or Easypaisa app. More on [video chat in Pakistan](/video-chat-pakistan/).` },
      { cta: { title: "Start earning from conversations", body: "Get your verified badge, start a call, and gifts do the rest." } },
    ],
    faqs: [
      { q: "Can I withdraw video chat earnings to JazzCash?", a: `Yes. On ${n} you can cash out gems to a JazzCash mobile wallet, an Easypaisa wallet or a bank account (IBAN).` },
      { q: "Why do I need a selfie to cash out?", a: "Larger monthly amounts require a quick selfie check to confirm the account owner is the one withdrawing." },
      { q: "How much of a gift do I keep?", a: "You keep 50% of every gift's value as gems." },
    ],
    related: ["/earn-money-video-chat/", "/video-chat-pakistan/", "/blog/conversation-starters-for-video-chat/"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "how-to-choose-a-random-video-chat-app",
    title: "How to Choose a Random Video Chat App: 9 Things to Check",
    metaTitle: "How to Choose a Random Video Chat App: 9 Checks",
    description: "Not all random video chat apps are equal. Nine things to check before you turn on your camera — verification, moderation, age rules, pricing, privacy and more.",
    keywords: ["best random video chat app", "random video chat apps", "best omegle alternatives", "video chat app comparison", "how to choose video chat app"],
    category: "Guides",
    published: "2026-10-05",
    excerpt: "Since Omegle closed, dozens of random video chat apps have appeared. Nine questions that separate the good ones from the risky ones.",
    blocks: [
      { p: "Since Omegle closed in 2023, dozens of apps and sites have rushed in to replace it. Some are good. Some are clones with no moderation at all. Before you turn on your camera, run through these nine checks." },
      { h2: "1. Is there verification?" },
      { p: "Can anyone appear on camera, or does the app confirm there's a real person behind the profile? Selfie verification — matching a live selfie to the profile photo — is the strongest common approach. Bonus: can you choose to match with verified people only?" },
      { h2: "2. How does a call start?" },
      { p: "The first seconds of a call with a stranger are the riskiest. Some apps blur both videos at the start so nobody is caught off guard. It's a small feature with a big effect." },
      { h2: "3. Can you report during the call?" },
      { p: "A report button buried in a menu won't get used. Look for one that's always on screen, ends the call instantly, and is reviewed by people — ideally around the clock." },
      { h2: "4. Is it clearly 18+?" },
      { p: "A clear adults-only rule, enforced, keeps out people who shouldn't be there and tells you the operator takes responsibility seriously." },
      { h2: "5. Is the pricing honest?" },
      { p: "Free should mean free to match and talk. Paid extras (filters, gifts, subscriptions) should be clearly priced, and subscriptions should be easy to cancel. Be wary of apps that charge before you've had a single conversation." },
      { h2: "6. Do you have to install anything?" },
      { p: "Good apps work in a normal browser using WebRTC. Never install unknown extensions or desktop software to video chat." },
      { h2: "7. Can you keep good connections?" },
      { p: "Pure one-off randomness gets old. The best apps let you add someone after a great call and keep talking." },
      { h2: "8. Does it support how you pay?" },
      { p: "In Pakistan, that means JazzCash, Easypaisa, local cards and bank transfer in PKR — not just USD app-store billing." },
      { h2: "9. Who runs it?" },
      { p: "Look for terms of service, a privacy policy and a support contact. If you can't tell who operates a site, don't give it your face." },
      { h2: `How ${n} does on the checklist` },
      {
        table: {
          head: ["Check", n],
          rows: [
            ["Verification", "Selfie verification with badge; verified-only matching"],
            ["Call start", "Both videos start blurred"],
            ["Reporting", "Always on screen, two taps, reviewed 24/7"],
            ["Age", "18+ only"],
            ["Pricing", "Free to match and chat; optional coins and VIP (3-day free trial)"],
            ["Install", "Runs in the browser; Android app optional"],
            ["Keep connections", "Add friends, chat after the call"],
            ["Local payments", "JazzCash, Easypaisa, card, bank (PKR)"],
          ],
        },
      },
      { cta: { title: "See if it passes your checklist", body: "Free to try in your browser. 18+." } },
    ],
    related: ["/omegle-alternative/", "/chatroulette-alternative/", "/safe-video-chat/", "/blog/what-happened-to-omegle/"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: "make-friends-online-pakistan",
    title: "How to Make Friends Online in Pakistan (Safely)",
    description: "Where and how to make new friends online in Pakistan — from interest communities to video chat — with tips to turn a good chat into a real friendship, safely.",
    keywords: ["make friends online pakistan", "online friends pakistan", "how to make friends online", "dosti online", "meet new people pakistan"],
    category: "Guides",
    published: "2026-10-05",
    excerpt: "Moved to a new city, finished university, or just want new people to talk to? How to make friends online in Pakistan — and keep them.",
    blocks: [
      { p: "Moved to Karachi for work? Back home in Multan after university? Or just tired of talking to the same five people? Making new friends as an adult is hard everywhere — but the internet makes the first step easier than it's ever been." },
      { h2: "Start with what you already love" },
      { p: "Friendships grow fastest around a shared thing. Cricket, gaming, coding, poetry, books, food — Pakistan has active online communities for all of them on Discord, Facebook groups and Reddit. Join two or three, and show up regularly. Being a familiar name matters more than being the funniest one." },
      { h2: "Try video, not just text" },
      { p: "Text is easy to misread and easy to ignore. Ten minutes of a real conversation on camera tells you more about someone than a week of messages. That's why random video chat works for meeting people: you hear a voice, see a smile, and know quickly whether you click." },
      { p: `On ${n} you can set the country filter to Pakistan to talk in Urdu, Punjabi or your own language with someone who gets the references — or turn it off to make friends in Dubai, London or Toronto. When a call goes well, **add each other** and keep chatting after it ends.` },
      { h2: "Turn a good chat into a friendship" },
      {
        ol: [
          "**Follow up within a day.** \"That story about your cousin's wedding — what happened next?\"",
          "**Make a small plan.** Watch the same match, play a game, recommend each other a song.",
          "**Be the one who remembers.** Exams, interviews, a sick parent — ask how it went.",
          "**Keep it light at first.** Deep friendships take time; you don't need to share everything in week one.",
        ],
      },
      { h2: "Stay safe while you do it" },
      {
        ul: [
          "Keep your phone number, address and family details private until you really know someone.",
          "Never send money, mobile load or wallet transfers to someone you've only met online.",
          "If you ever meet in person, choose a public place and tell a friend or family member.",
          "Use apps with verification and reporting — and use the report button when someone crosses a line.",
        ],
      },
      { p: `More in our [12 video chat safety tips](/blog/video-chat-safety-tips/).` },
      { cta: { title: "Meet someone new tonight", body: "Video chat with people in Pakistan or worldwide. Free, 18+." } },
    ],
    faqs: [
      { q: "What is the best way to make friends online in Pakistan?", a: "Join communities around your interests and try video chat, which builds trust faster than text. Apps with verification and country filters let you meet people in Pakistan safely." },
      { q: "Is online friendship safe?", a: "It can be. Keep personal and financial details private, use apps with verification and reporting, and meet only in public places if you ever meet in person." },
    ],
    related: ["/video-chat-pakistan/", "/talk-to-strangers/", "/blog/conversation-starters-for-video-chat/", "/blog/video-chat-safety-tips/"],
  },
];

export const postBySlug = (slug: string) => POSTS.find((p) => p.slug === slug);
