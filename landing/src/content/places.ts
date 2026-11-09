import type { Block, Faq, KeywordPage } from "@/content/types";
import { site } from "@/lib/site";

/*
 * Country and city landing pages ("video chat <country>", "video chat
 * <city>"). Each one gets its own angle, cities, languages, a local-time
 * table and FAQs, so no two pages read as copies of each other.
 *
 * Keep it true: most people on the app today are in Pakistan, coins and
 * cash-outs are built around PKR / JazzCash / Easypaisa / Pakistani banks,
 * and there is a country filter but no city filter.
 *
 * Not listed on purpose: UAE, Qatar, Oman — their networks block or throttle
 * consumer internet video calling, so visitors there may not get a call
 * through. Add them only once calls are confirmed to connect there.
 */
const n = site.name;
const UPDATED = "2026-11-09";

type Country = {
  slug: string;
  /** "Saudi Arabia" */
  name: string;
  /** After "in": "the UK". Defaults to name. */
  inName?: string;
  /** In titles: "UK". Defaults to name. */
  short?: string;
  /** Standard-time UTC offset. */
  utc: number;
  /** Clocks go forward in summer. */
  dst?: boolean;
  /** Which clock the table uses, when the country has several. */
  zoneNote?: string;
  /** Pakistani hours (24h) to show in the table. Default: the evening. */
  pkHours?: number[];
  /** Pakistanis living abroad: cash-outs to a Pakistani wallet are a real draw. */
  diaspora?: boolean;
  cities: string[];
  languages: string[];
  title?: string;
  h1: string;
  lede: string;
  angle: { h2: string; p: string[] };
  /** The sentence above the time table: how Pakistani evenings land locally. */
  timing: string;
  faqs: Faq[];
  keywords: string[];
  related: string[];
};

const PK_EVENING = [20, 21, 22, 23, 0];

/** 21.5 → "9:30 pm", 0 → "midnight". */
function clock(h: number) {
  const t = ((h % 24) + 24) % 24;
  const hh = Math.floor(t);
  const mm = Math.round((t - hh) * 60);
  if (hh === 0 && mm === 0) return "midnight";
  if (hh === 12 && mm === 0) return "noon";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
}

function timeTable(c: Country): Block {
  const local = c.inName ?? c.name;
  const hours = c.pkHours ?? PK_EVENING;
  const notes = [c.zoneNote, c.dst ? "Standard time: add an hour while clocks are forward for summer." : undefined].filter(Boolean).join(" ");
  return {
    table: {
      head: ["In Pakistan (PKT)", `In ${local}`],
      rows: hours.map((h) => [clock(h), clock(h - 5 + c.utc)]),
      ...(notes ? { caption: notes } : {}),
    },
  };
}

function countryPage(c: Country): KeywordPage {
  const inName = c.inName ?? c.name;
  const short = c.short ?? c.name;
  const lc = short.toLowerCase();
  const [c1, c2, c3] = c.cities;
  const money = c.diaspora
    ? `Matching, chat and video calls with friends are free from ${inName}. Coins are optional extras for gifts, boosts and filters. Coin purchases and cash-outs are built around Pakistan today: rupees, JazzCash, Easypaisa and Pakistani bank accounts. If you still keep a JazzCash or Easypaisa number or a Pakistani IBAN, you can cash out the gems you earn from gifts straight to it. See [how cash-outs work](/blog/cash-out-jazzcash-easypaisa/).`
    : `Matching, chat and video calls with friends are free from ${inName}, and you never need to buy anything to talk. Coins are optional extras for gifts, boosts and filters. Payments and cash-outs are built around Pakistan today (rupees, JazzCash, Easypaisa and Pakistani banks), so from ${inName} gifts are simply a fun way to say thanks for now.`;

  const blocks: Block[] = [
    { h2: c.angle.h2 },
    ...c.angle.p.map((p) => ({ p })),
    { h2: `Who you'll meet` },
    {
      p: `Whether you're in ${c1}, ${c2}, ${c3} or anywhere else in ${inName}, tap **Start** and you're face to face with someone new. Set the **country filter** to ${c.name} to meet people there, or leave it open for people from Pakistan and the rest of the world. Calls often switch between ${c.languages.slice(0, -1).join(", ")} and ${c.languages.at(-1)}: talk in whatever you're both comfortable with.`,
    },
    { h2: `When to go online from ${inName}` },
    { p: `Most people on ${n} today are in Pakistan, so the busiest hours follow Pakistani evenings. ${c.timing}` },
    timeTable(c),
    { p: `There's also a **Vibe Hour** every day, when every filter is free and XP is doubled. The app shows when it starts.` },
    { cta: { title: `Start a video chat from ${inName}`, body: "Someone new in one tap. Free to match, 18+ only." } },
    { h2: `Free to use from ${inName}` },
    { p: money },
    { h2: "Safe by default" },
    {
      ul: [
        "Every random call starts blurred for a few seconds.",
        "Selfie-verified badges, and a verified-only mode.",
        "Report in two taps; reports are reviewed 24/7 and repeat offenders removed.",
        "18+ only, always.",
      ],
    },
    { h2: "Works on any phone" },
    {
      p: `Open ${n} in your phone's browser (Chrome on Android, Safari on iPhone) or install the Android app. Nothing to set up on a computer either. Video adapts to your connection, so a call keeps going on mobile data. More on [video chat with no download](/video-chat-online/).`,
    },
  ];

  return {
    slug: c.slug,
    group: "country",
    navLabel: short,
    title: c.title ?? `Video Chat ${short}: Meet New People Free`,
    description: `Free random video chat in ${inName}: meet real, selfie-verified people from ${c1}, ${c2} and the world. Calls start blurred. No download. 18+.`,
    keywords: [`video chat ${lc}`, `random video chat ${lc}`, `video call app ${lc}`, `talk to strangers ${lc}`, `make friends in ${lc}`, `meet new people ${lc}`, ...c.keywords],
    kicker: `Video chat in ${inName}`,
    h1: c.h1,
    lede: c.lede,
    blocks,
    faqs: [
      ...c.faqs,
      { q: `Is ${n} free in ${inName}?`, a: `Yes. Matching, chatting and video calls with friends are free. Coins and VIP are optional.` },
      { q: `Can I only match with people from ${inName}?`, a: `Yes. Set the country filter to ${c.name}. Filters are free during the daily Vibe Hour and with VIP, and cost a few coins otherwise.` },
    ],
    related: [...c.related, "/video-chat-by-country/"],
    updated: UPDATED,
  };
}

/* ── Countries ────────────────────────────────────────────────────────────── */

const COUNTRIES: Country[] = [
  // Gulf — Pakistanis working abroad, close time zones, calling allowed.
  {
    slug: "video-chat-saudi-arabia",
    name: "Saudi Arabia",
    utc: 3,
    diaspora: true,
    cities: ["Riyadh", "Jeddah", "Dammam", "Madinah"],
    languages: ["Urdu", "Arabic", "Punjabi", "English"],
    h1: "Video chat in Saudi Arabia, with home one tap away",
    lede: `Finished a long shift in Riyadh or Jeddah and want an easy conversation in Urdu? ${n} puts you on live video with someone new in one tap: people back home in Pakistan, others in Saudi Arabia, or anyone in the world. Free in your browser or on Android, 18+.`,
    angle: {
      h2: "Made for evenings far from home",
      p: [
        "Pakistan is only two hours ahead of Saudi Arabia, so when your evening starts, Pakistan's busiest hours are already under way. You can talk to people from home without staying up half the night.",
        "Not every call has to be about home, either. Turn on the country filter to meet other people in Saudi Arabia, or leave it open and see who's out there. If someone's good company, add each other as friends and keep talking in chat. Video calls between friends only switch on once you both allow them.",
      ],
    },
    timing: "Pakistan is two hours ahead, so Pakistani prime time is your early-to-late evening:",
    faqs: [
      { q: "Does video chat work in Saudi Arabia?", a: `Saudi Arabia has allowed internet voice and video calls since 2017. ${n} works in your phone's browser or the Android app, on Wi-Fi or mobile data.` },
      { q: "Can I talk to people in Pakistan from Saudi Arabia?", a: "Yes. Matching is worldwide by default and most people on the app are in Pakistan. To meet only people in Pakistan, set the country filter to Pakistan." },
    ],
    keywords: ["video chat riyadh", "video chat jeddah", "pakistani in saudi arabia", "urdu video chat saudi"],
    related: ["/video-chat-kuwait/", "/video-chat-pakistan/", "/make-friends-app/"],
  },
  {
    slug: "video-chat-kuwait",
    name: "Kuwait",
    utc: 3,
    diaspora: true,
    cities: ["Kuwait City", "Hawalli", "Farwaniya", "Jahra"],
    languages: ["Urdu", "Arabic", "English", "Punjabi"],
    h1: "Video chat in Kuwait: meet someone new tonight",
    lede: `${n} is free random video chat that works from Kuwait: tap Start and you're talking face to face with someone in Pakistan, elsewhere in the Gulf or across the world. Selfie-verified people, calls that start blurred, and nothing to install. 18+.`,
    angle: {
      h2: "Kuwait to Pakistan in one tap",
      p: [
        "Lots of people in Kuwait are a long way from family and friends. A quick video chat after work is an easy way to hear Urdu, Punjabi or Pashto, swap news from home, or just laugh with someone who gets your jokes.",
        "Want something different? Leave the country filter off and meet people from everywhere: practise your English, learn some Arabic, or hear what life is like somewhere you've never been.",
      ],
    },
    timing: "With Pakistan two hours ahead, its busiest hours line up with your evening:",
    faqs: [
      { q: "Does video chat work in Kuwait?", a: `Internet calling generally works on Kuwaiti networks. ${n} runs in your browser or the Android app on Wi-Fi or mobile data.` },
      { q: "Can I use Urdu on video chat?", a: "Yes. Talk in whatever language you both like. Most people on the app are in Pakistan, so Urdu is common." },
    ],
    keywords: ["video chat kuwait city", "pakistani in kuwait", "make friends kuwait", "urdu chat kuwait"],
    related: ["/video-chat-saudi-arabia/", "/video-chat-pakistan/", "/talk-to-strangers/"],
  },

  // Pakistanis abroad — the West.
  {
    slug: "video-chat-uk",
    name: "the United Kingdom",
    inName: "the UK",
    short: "UK",
    utc: 0,
    dst: true,
    diaspora: true,
    cities: ["London", "Birmingham", "Manchester", "Bradford"],
    languages: ["English", "Urdu", "Punjabi", "Pahari-Pothwari"],
    h1: "Video chat in the UK: meet new people, near or back home",
    lede: `${n} is free random video chat for the UK. One tap and you're on camera with someone new, in Britain, in Pakistan or anywhere in the world. Everyone can get a selfie-verified badge, every call starts blurred, and it runs in your browser with nothing to install. 18+.`,
    angle: {
      h2: "From Bradford to Lahore, one tap",
      p: [
        "Britain has one of the largest Pakistani communities in the world, and plenty of people grew up between two places. Use the country filter to talk to someone in Pakistan: brush up your Urdu or Punjabi, hear how things really are back home, or make a friend you'll visit next time you fly out.",
        "Or keep it local: set the filter to the UK and meet people in your own time zone. Leave it off and anyone in the world can be next.",
      ],
    },
    timing: "Pakistan is five hours ahead (four during British Summer Time), so its evenings land in your afternoon:",
    faqs: [
      { q: "Is there an Omegle alternative in the UK?", a: `Yes. ${n} keeps Omegle's one-tap random video chat and adds selfie verification, blurred call starts, 24/7 moderation and an 18+ rule. See our [Omegle alternative](/omegle-alternative/) page.` },
      { q: "Can I talk to people in Pakistan from the UK?", a: "Yes. Set the country filter to Pakistan, or leave it open, since most people on the app are in Pakistan today." },
    ],
    keywords: ["video chat united kingdom", "pakistani friends uk", "desi video chat uk", "omegle alternative uk", "video chat london"],
    related: ["/omegle-alternative/", "/video-chat-pakistan/", "/video-chat-usa/"],
  },
  {
    slug: "video-chat-usa",
    name: "the United States",
    inName: "the USA",
    short: "USA",
    utc: -5,
    dst: true,
    zoneNote: "Eastern time (New York). Central is an hour earlier, Pacific three hours earlier.",
    diaspora: true,
    cities: ["New York", "Houston", "Chicago", "Los Angeles"],
    languages: ["English", "Urdu", "Spanish", "Punjabi"],
    title: "Video Chat USA: Random Video Chat, Verified People",
    h1: "Random video chat in the USA, with real, verified people",
    lede: `${n} brings back one-tap random video chat for the USA, without the free-for-all. Tap Start to meet someone new anywhere in the world, from New York to Lahore. Selfie verification, blurred call starts and 24/7 moderation are on by default. Free, 18+.`,
    angle: {
      h2: "Your lunch break is Pakistan's prime time",
      p: [
        "Pakistan is ten hours ahead of the East Coast, so its busiest evening hours fall in your late morning and early afternoon. It's a good time to meet people on the other side of the world: Pakistani-Americans catching up with home, or anyone curious about a country they've only seen in the news.",
        "Prefer people in your own time zone? Set the country filter to the United States. Or leave it off and let the next call surprise you.",
      ],
    },
    timing: "Pakistan is ten hours ahead of New York (nine in summer). Its evenings are your midday:",
    faqs: [
      { q: "What's the best Omegle alternative in the US?", a: `Look for random video chat with real moderation. ${n} has one-tap matching plus selfie verification, blurred call starts, 24/7 review of reports and an 18+ rule.` },
      { q: `Does ${n} work on iPhone?`, a: `Yes. Open ${n} in Safari on your iPhone: there's nothing to install. Android has an app as well.` },
    ],
    keywords: ["video chat united states", "random video chat america", "american video chat app", "omegle alternative usa", "pakistani american"],
    related: ["/omegle-alternative/", "/video-chat-canada/", "/ometv-alternative/"],
  },
  {
    slug: "video-chat-canada",
    name: "Canada",
    utc: -5,
    dst: true,
    zoneNote: "Eastern time (Toronto). Vancouver is three hours earlier.",
    diaspora: true,
    cities: ["Toronto", "Mississauga", "Calgary", "Vancouver"],
    languages: ["English", "Urdu", "Punjabi", "French"],
    h1: "Video chat in Canada: meet someone new, anywhere",
    lede: `${n} is free random video chat for Canada: one tap connects you on live video with a real person in Canada, Pakistan or anywhere else. Calls start blurred, people can be selfie-verified, and you don't need to download anything. 18+.`,
    angle: {
      h2: "Toronto, Mississauga and the rest of the world",
      p: [
        "Canada's Pakistani community is large, especially around Toronto and Mississauga, and lots of families have one foot in each country. Use the country filter to talk to someone in Pakistan, or to meet people closer to home in Canada.",
        "If you're new to Canada, a few friendly video chats can make a new city feel less lonely, and you can practise your English or French with people who don't mind a mistake or two.",
      ],
    },
    timing: "Pakistan is ten hours ahead of Toronto (nine in summer), so its busiest evenings fall around your midday:",
    faqs: [
      { q: "Is random video chat safe in Canada?", a: `${n} starts every random call blurred, gives real people a selfie-verified badge, keeps a report button on screen with 24/7 review, and is 18+ only.` },
      { q: "Can I meet people from Pakistan?", a: "Yes. Most people on the app are in Pakistan today. Set the country filter to Pakistan to meet only them." },
    ],
    keywords: ["video chat toronto", "pakistani canadian", "make friends canada", "random video chat canada"],
    related: ["/video-chat-usa/", "/video-chat-uk/", "/make-friends-app/"],
  },
  {
    slug: "video-chat-australia",
    name: "Australia",
    utc: 10,
    dst: true,
    zoneNote: "Sydney and Melbourne time. Perth is two hours earlier.",
    pkHours: [14, 15, 16, 17, 18],
    diaspora: true,
    cities: ["Sydney", "Melbourne", "Brisbane", "Perth"],
    languages: ["English", "Urdu", "Punjabi", "Hindi"],
    h1: "Video chat in Australia: one tap to someone new",
    lede: `${n} is free random video chat that works from Australia. Tap Start and you're on camera with a real person in Australia, Pakistan, Asia or anywhere else. Selfie-verified badges, calls that start blurred and 24/7 moderation. No download, 18+.`,
    angle: {
      h2: "Your evening, Pakistan's afternoon",
      p: [
        "Australia is five hours ahead of Pakistan, so Pakistan's late-night rush falls in your small hours. Your own evening is Pakistan's afternoon: still a good time to find people, especially students and anyone home early.",
        "Asia is close, too. Leave the country filter off to meet people from the Philippines, Malaysia and everywhere in between, or set it to Australia to keep it local.",
      ],
    },
    timing: "Pakistan is five hours behind Sydney (six during daylight saving). Pakistani afternoons are your evenings:",
    faqs: [
      { q: "When is the best time to video chat from Australia?", a: "Your evening is Pakistan's afternoon, which works well. The busiest Pakistani hours fall around 1 to 5 am in Sydney." },
      { q: "Can I talk to people in Pakistan from Australia?", a: "Yes. Set the country filter to Pakistan, or leave it open to meet anyone." },
    ],
    keywords: ["video chat sydney", "video chat melbourne", "pakistani in australia", "random video chat australia"],
    related: ["/video-chat-philippines/", "/video-chat-malaysia/", "/random-video-chat/"],
  },
  {
    slug: "video-chat-italy",
    name: "Italy",
    utc: 1,
    dst: true,
    diaspora: true,
    cities: ["Milan", "Brescia", "Rome", "Bologna"],
    languages: ["Italian", "Urdu", "Punjabi", "English"],
    h1: "Video chat in Italy: Pakistan, Europe and the world",
    lede: `${n} is free random video chat for Italy. One tap and you're on live video with someone new: in Italy, back in Pakistan or anywhere in the world. Real, selfie-verified people, calls that start blurred, and nothing to install. 18+.`,
    angle: {
      h2: "A bit of home, wherever you work",
      p: [
        "Italy is home to one of Europe's biggest Pakistani communities, especially in Lombardy around Brescia and Milan. After work, a video chat with someone in Pakistan is an easy way to hear Urdu or Punjabi and catch up on life back home.",
        "Want to practise Italian instead? Set the country filter to Italy and talk to people where you live. Leave it open and anyone in the world can be next.",
      ],
    },
    timing: "Pakistan is four hours ahead (three in summer), so its evenings are your late afternoon and evening:",
    faqs: [
      { q: "Can I meet Pakistanis in Italy on video chat?", a: "Set the country filter to Italy to meet people there, or to Pakistan to talk to people back home." },
      { q: "Can I use it in Italian?", a: "Talk in any language you like. The app and website are in English for now." },
    ],
    keywords: ["video chat italia", "pakistani in italy", "chat video italia", "random video chat italy"],
    related: ["/video-chat-germany/", "/video-chat-norway/", "/video-chat-pakistan/"],
  },
  {
    slug: "video-chat-germany",
    name: "Germany",
    utc: 1,
    dst: true,
    diaspora: true,
    cities: ["Berlin", "Frankfurt", "Munich", "Hamburg"],
    languages: ["German", "English", "Urdu", "Punjabi"],
    h1: "Video chat in Germany: meet new people, live",
    lede: `${n} is free random video chat that works from Germany. Tap Start and talk face to face with someone in Germany, Pakistan or anywhere else. Selfie verification, blurred call starts and 24/7 moderation are built in. No download needed, 18+.`,
    angle: {
      h2: "Students, workers and the plain curious",
      p: [
        "Lots of Pakistanis come to Germany to study or work, from Berlin to Munich. A random video chat is a low-pressure way to hear a familiar language, or to practise your German with someone patient.",
        "Not from Pakistan? You'll still meet people from all over the world. Video chat with a stranger is one of the quickest ways to hear how other people live.",
      ],
    },
    timing: "Pakistan is four hours ahead (three in summer). Its busiest hours fall in your late afternoon and evening:",
    faqs: [
      { q: "Is there a safe Omegle alternative in Germany?", a: `Yes. ${n} has one-tap random video chat with selfie verification, blurred call starts, 24/7 moderation and an 18+ rule.` },
      { q: "Can I meet people in Germany only?", a: "Yes. Set the country filter to Germany." },
    ],
    keywords: ["video chat deutschland", "omegle alternative deutschland", "pakistani in germany", "random video chat germany"],
    related: ["/video-chat-italy/", "/video-chat-norway/", "/omegle-alternative/"],
  },
  {
    slug: "video-chat-norway",
    name: "Norway",
    utc: 1,
    dst: true,
    diaspora: true,
    cities: ["Oslo", "Bergen", "Drammen", "Stavanger"],
    languages: ["Norwegian", "English", "Urdu", "Punjabi"],
    h1: "Video chat in Norway: meet someone new in one tap",
    lede: `${n} is free random video chat for Norway. One tap puts you on live video with a real person in Norway, Pakistan or anywhere in the world. Calls start blurred, people can get a verified badge, and it all runs in your browser. 18+.`,
    angle: {
      h2: "Oslo to Pakistan, and everywhere between",
      p: [
        "Norway's Pakistani community has been part of Oslo life for decades, and plenty of Norwegian-Pakistanis still have family and friends back home. Set the country filter to Pakistan to talk to someone there, or to Norway to stay close.",
        "Long, dark winter evenings are a good excuse to meet someone new. Leave the filter off and let the next call be anywhere.",
      ],
    },
    timing: "Pakistan is four hours ahead (three in summer), so its prime time is your late afternoon and evening:",
    faqs: [
      { q: "Can I talk to people in Pakistan from Norway?", a: "Yes. Most people on the app are in Pakistan today. Set the country filter to Pakistan to meet only them." },
      { q: `Does ${n} work in Norway?`, a: `Yes. ${n} runs in any modern browser and as an Android app, on Wi-Fi or mobile data.` },
    ],
    keywords: ["video chat oslo", "norsk pakistansk", "pakistani in norway", "random video chat norway"],
    related: ["/video-chat-germany/", "/video-chat-italy/", "/video-chat-uk/"],
  },

  // English-speaking markets with lots of searches for talking to strangers.
  {
    slug: "video-chat-nigeria",
    name: "Nigeria",
    utc: 1,
    cities: ["Lagos", "Abuja", "Port Harcourt", "Ibadan"],
    languages: ["English", "Pidgin", "Yoruba", "Igbo", "Hausa"],
    h1: "Video chat in Nigeria: talk to new people worldwide",
    lede: `${n} is free random video chat that works in Nigeria. Tap Start and you're face to face with someone new: in Lagos, in Pakistan or anywhere in the world. Selfie-verified people, calls that start blurred, and no app needed on a computer. 18+.`,
    angle: {
      h2: "English opens every door",
      p: [
        "Nigeria speaks English, and so do lots of people on the other side of the world. Every random call can be a real conversation: football, Afrobeats, food, exams, business ideas, whatever you're into.",
        "Want to meet Nigerians? Set the country filter to Nigeria. Want to see the world? Leave it off and you could be talking to someone in Pakistan, the Philippines or Kenya next.",
      ],
    },
    timing: "Pakistan is four hours ahead, so its busiest hours are your late afternoon and evening:",
    faqs: [
      { q: "Does video chat work on Nigerian mobile data?", a: `Yes. ${n} adapts video to your connection, so calls keep going on 4G even when the signal dips. Wi-Fi gives the best picture.` },
      { q: "Can I meet Nigerians only?", a: "Yes. Set the country filter to Nigeria." },
    ],
    keywords: ["video chat lagos", "nigerian video chat app", "talk to strangers nigeria", "random video call nigeria"],
    related: ["/video-chat-ghana/", "/video-chat-kenya/", "/practice-english-speaking/"],
  },
  {
    slug: "video-chat-philippines",
    name: "the Philippines",
    short: "Philippines",
    utc: 8,
    cities: ["Manila", "Quezon City", "Cebu", "Davao"],
    languages: ["English", "Filipino", "Cebuano"],
    h1: "Video chat in the Philippines: meet someone new now",
    lede: `${n} is free random video chat that works in the Philippines. Tap Start and you're on live video with someone new, at home or anywhere in the world. Real, selfie-verified people, calls that start blurred, and nothing to install. 18+.`,
    angle: {
      h2: "Friendly faces, from Manila to everywhere",
      p: [
        "Filipinos are known for being easy to talk to, and English is spoken widely, so conversations with people abroad flow naturally. Swap stories, share music and food, or just keep each other company on a quiet night.",
        "Set the country filter to the Philippines to meet people at home, or leave it off and see who's on the other side of the world.",
      ],
    },
    timing: "The Philippines is three hours ahead of Pakistan, so Pakistani evenings land late in yours:",
    faqs: [
      { q: "Is random video chat safe in the Philippines?", a: `${n} starts every random call blurred, verifies people with a selfie check, reviews reports 24/7 and is strictly 18+.` },
      { q: "Can I meet Filipinos only?", a: "Yes. Set the country filter to the Philippines." },
    ],
    keywords: ["video chat pilipinas", "random video chat filipino", "talk to strangers philippines", "video chat manila", "video chat cebu"],
    related: ["/video-chat-malaysia/", "/video-chat-australia/", "/talk-to-strangers/"],
  },
  {
    slug: "video-chat-kenya",
    name: "Kenya",
    utc: 3,
    cities: ["Nairobi", "Mombasa", "Kisumu", "Nakuru"],
    languages: ["English", "Swahili"],
    h1: "Video chat in Kenya: meet new people face to face",
    lede: `${n} is free random video chat that works in Kenya. One tap connects you on live video with someone new, in Nairobi or anywhere in the world. Calls start blurred, people can be selfie-verified, and it runs right in your browser. 18+.`,
    angle: {
      h2: "From Nairobi to the world",
      p: [
        "Kenya is two hours behind Pakistan, so your evening overlaps with the busiest time on the app. That means shorter waits and more people to meet.",
        "Talk in English or Swahili, share what life is like in Kenya, and hear how people live in Pakistan and beyond. Set the country filter to Kenya if you'd rather meet people at home.",
      ],
    },
    timing: "Pakistan is two hours ahead, so its busiest hours fit neatly into your evening:",
    faqs: [
      { q: "Does it work on Safaricom or Airtel data?", a: `Yes. ${n} works on mobile data or Wi-Fi and adapts video to your connection.` },
      { q: "Can I meet Kenyans only?", a: "Yes. Set the country filter to Kenya." },
    ],
    keywords: ["video chat nairobi", "talk to strangers kenya", "kenyan video chat app", "make friends nairobi"],
    related: ["/video-chat-nigeria/", "/video-chat-south-africa/", "/talk-to-strangers/"],
  },
  {
    slug: "video-chat-ghana",
    name: "Ghana",
    utc: 0,
    cities: ["Accra", "Kumasi", "Tamale", "Takoradi"],
    languages: ["English", "Twi", "Ga", "Ewe"],
    h1: "Video chat in Ghana: one tap to someone new",
    lede: `${n} is free random video chat that works in Ghana. Tap Start and talk face to face with a real person in Accra, Pakistan or anywhere else. Selfie-verified badges, calls that start blurred and 24/7 moderation. No download, 18+.`,
    angle: {
      h2: "Good conversations, wherever they are",
      p: [
        "Ghanaians are known for warm, easy conversation, and with English as a shared language, a stranger on the other side of the world can feel like a friend within minutes.",
        "Set the country filter to Ghana to meet people at home, or leave it open to talk to Nigeria, Kenya, Pakistan and everywhere else.",
      ],
    },
    timing: "Pakistan is five hours ahead, so its busiest hours fall in your afternoon and early evening:",
    faqs: [
      { q: "Can I meet people from Ghana only?", a: "Yes. Set the country filter to Ghana." },
      { q: "Does it work on mobile data?", a: `Yes. ${n} runs on mobile data or Wi-Fi and adapts video to your connection.` },
    ],
    keywords: ["video chat accra", "talk to strangers ghana", "make friends ghana", "ghana video chat app"],
    related: ["/video-chat-nigeria/", "/video-chat-kenya/", "/practice-english-speaking/"],
  },
  {
    slug: "video-chat-south-africa",
    name: "South Africa",
    utc: 2,
    cities: ["Johannesburg", "Cape Town", "Durban", "Pretoria"],
    languages: ["English", "Zulu", "Afrikaans", "Xhosa"],
    h1: "Video chat in South Africa: meet new people live",
    lede: `${n} is free random video chat that works in South Africa. One tap and you're on live video with someone new, from Joburg to Lahore. Real, selfie-verified people, calls that start blurred, and nothing to install. 18+.`,
    angle: {
      h2: "Mzansi meets the world",
      p: [
        "South Africa is three hours behind Pakistan, so your evening lines up with the busiest time on the app. Talk cricket, music, food, or whatever you're curious about.",
        "Set the country filter to South Africa to meet people at home, or leave it open and let the next call be anywhere.",
      ],
    },
    timing: "Pakistan is three hours ahead, so its busiest hours fall in your evening:",
    faqs: [
      { q: "Is random video chat safe in South Africa?", a: `${n} starts every random call blurred, gives real people a selfie-verified badge, reviews reports 24/7 and is 18+ only.` },
      { q: "Can I meet South Africans only?", a: "Yes. Set the country filter to South Africa." },
    ],
    keywords: ["video chat johannesburg", "video chat cape town", "talk to strangers south africa", "random video chat sa"],
    related: ["/video-chat-kenya/", "/video-chat-nigeria/", "/safe-video-chat/"],
  },

  // Neighbours in nearby time zones.
  {
    slug: "video-chat-bangladesh",
    name: "Bangladesh",
    utc: 6,
    cities: ["Dhaka", "Chattogram", "Sylhet", "Khulna"],
    languages: ["Bangla", "English"],
    h1: "Video chat in Bangladesh: meet new people tonight",
    lede: `${n} is free random video chat that works in Bangladesh. Tap Start and you're face to face with someone new, in Dhaka, in Pakistan or anywhere in the world. Selfie-verified people, calls that start blurred, and it runs in your browser. 18+.`,
    angle: {
      h2: "One hour from Pakistan's prime time",
      p: [
        "Bangladesh is just one hour ahead of Pakistan, so the busiest time on the app is your evening too. More people online means shorter waits.",
        "Talk in Bangla with people at home, or practise your English with someone abroad. Set the country filter to Bangladesh, or leave it open for the whole world.",
      ],
    },
    timing: "Bangladesh is one hour ahead of Pakistan, so the busiest hours are your evening:",
    faqs: [
      { q: "Can I meet people from Bangladesh only?", a: "Yes. Set the country filter to Bangladesh." },
      { q: "Can I practise English on video chat?", a: "Yes. Many people use random video chat to practise speaking. See our [practise English speaking](/practice-english-speaking/) guide." },
    ],
    keywords: ["video chat dhaka", "bangladesh video call app", "talk to strangers bangladesh", "bd video chat"],
    related: ["/video-chat-sri-lanka/", "/video-chat-nepal/", "/practice-english-speaking/"],
  },
  {
    slug: "video-chat-sri-lanka",
    name: "Sri Lanka",
    utc: 5.5,
    cities: ["Colombo", "Kandy", "Galle", "Jaffna"],
    languages: ["Sinhala", "Tamil", "English"],
    h1: "Video chat in Sri Lanka: someone new, one tap away",
    lede: `${n} is free random video chat that works in Sri Lanka. One tap connects you on live video with a real person in Colombo, Pakistan or anywhere in the world. Calls start blurred, badges show who's verified, and you don't need to install anything. 18+.`,
    angle: {
      h2: "Half an hour from Pakistan's busiest time",
      p: [
        "Sri Lanka is only thirty minutes ahead of Pakistan, so your evening is the busiest time on the app. If you love cricket, you'll find plenty to talk about.",
        "Use the country filter to meet people in Sri Lanka, or leave it open to talk to people around the world in English.",
      ],
    },
    timing: "Sri Lanka is thirty minutes ahead of Pakistan, so the busiest hours fall right in your evening:",
    faqs: [
      { q: "Can I meet Sri Lankans only?", a: "Yes. Set the country filter to Sri Lanka." },
      { q: "Does it work on mobile data?", a: `Yes. ${n} runs on mobile data or Wi-Fi and adapts video to your connection.` },
    ],
    keywords: ["video chat colombo", "sri lanka video call app", "talk to strangers sri lanka"],
    related: ["/video-chat-bangladesh/", "/video-chat-nepal/", "/random-video-chat/"],
  },
  {
    slug: "video-chat-nepal",
    name: "Nepal",
    utc: 5.75,
    cities: ["Kathmandu", "Pokhara", "Lalitpur", "Biratnagar"],
    languages: ["Nepali", "English", "Hindi"],
    h1: "Video chat in Nepal: meet new people face to face",
    lede: `${n} is free random video chat that works in Nepal. Tap Start and you're on live video with someone new, in Kathmandu or anywhere in the world. Selfie-verified people, calls that start blurred and 24/7 moderation. No download, 18+.`,
    angle: {
      h2: "Kathmandu to the world",
      p: [
        "Nepal is under an hour ahead of Pakistan, so your evening is the busiest time on the app. Meet people at home with the country filter, or talk to the world in English.",
        "Lots of people use random video chat to practise speaking English before studying or working abroad. Every call is a chance to get a little more confident.",
      ],
    },
    timing: "Nepal is 45 minutes ahead of Pakistan, so the busiest hours fall in your evening:",
    faqs: [
      { q: "Can I meet people from Nepal only?", a: "Yes. Set the country filter to Nepal." },
      { q: "Is it good for practising English?", a: "Yes. Leave the country filter off and you'll meet people from many countries. Our [practise English speaking](/practice-english-speaking/) guide has tips." },
    ],
    keywords: ["video chat kathmandu", "nepal video call app", "talk to strangers nepal"],
    related: ["/video-chat-bangladesh/", "/video-chat-sri-lanka/", "/practice-english-speaking/"],
  },
  {
    slug: "video-chat-malaysia",
    name: "Malaysia",
    utc: 8,
    cities: ["Kuala Lumpur", "Penang", "Johor Bahru", "Kota Kinabalu"],
    languages: ["Malay", "English", "Mandarin", "Tamil"],
    h1: "Video chat in Malaysia: meet someone new, live",
    lede: `${n} is free random video chat that works in Malaysia. One tap puts you face to face with someone new, in KL or anywhere in the world. Real, selfie-verified people, calls that start blurred, and nothing to install. 18+.`,
    angle: {
      h2: "Many languages, one tap",
      p: [
        "Malaysians switch between Malay, English, Mandarin and Tamil without thinking twice, which makes random video chat with the rest of the world easy.",
        "Set the country filter to Malaysia to meet people at home, or leave it open for the Philippines, Pakistan and everywhere else.",
      ],
    },
    timing: "Malaysia is three hours ahead of Pakistan, so Pakistani evenings land late in yours:",
    faqs: [
      { q: "Can I meet Malaysians only?", a: "Yes. Set the country filter to Malaysia." },
      { q: "Is random video chat safe in Malaysia?", a: `${n} starts every random call blurred, verifies people with a selfie check, reviews reports 24/7 and is 18+ only.` },
    ],
    keywords: ["video chat kuala lumpur", "malaysia video call app", "talk to strangers malaysia", "random video chat my"],
    related: ["/video-chat-philippines/", "/video-chat-australia/", "/random-video-chat/"],
  },
  {
    slug: "video-chat-egypt",
    name: "Egypt",
    utc: 2,
    dst: true,
    cities: ["Cairo", "Alexandria", "Giza", "Mansoura"],
    languages: ["Arabic", "English"],
    h1: "Video chat in Egypt: meet new people from anywhere",
    lede: `${n} is free random video chat that works in Egypt. Tap Start and you're on live video with someone new, in Cairo, in Pakistan or anywhere in the world. Selfie verification, blurred call starts and 24/7 moderation are built in. 18+.`,
    angle: {
      h2: "Cairo nights, worldwide conversations",
      p: [
        "Egypt is three hours behind Pakistan, so your evening is the busiest time on the app. Talk in Arabic with people at home, or in English with people abroad.",
        "Set the country filter to Egypt to keep it local, or leave it open and meet the world.",
      ],
    },
    timing: "Pakistan is three hours ahead (two in summer), so its busiest hours fall in your evening:",
    faqs: [
      { q: "Can I meet people from Egypt only?", a: "Yes. Set the country filter to Egypt." },
      { q: "Can I chat in Arabic?", a: "Yes. Talk in any language you both like. The app and website are in English for now." },
    ],
    keywords: ["video chat cairo", "egypt video call app", "talk to strangers egypt", "شات فيديو"],
    related: ["/video-chat-saudi-arabia/", "/video-chat-kuwait/", "/random-video-chat/"],
  },

  // Neighbours and near time zones — visitors already arrive from here.
  {
    slug: "video-chat-india",
    name: "India",
    utc: 5.5,
    cities: ["Mumbai", "Delhi", "Bengaluru", "Hyderabad"],
    languages: ["Hindi", "English", "Urdu", "Tamil"],
    title: "Video Chat India: Random Video Chat, Verified People",
    h1: "Random video chat in India, with real, verified people",
    lede: `${n} is free random video chat that works in India. Tap Start and you're face to face with someone new, in Mumbai, in Lahore or anywhere in the world. Selfie-verified badges, calls that start blurred and 24/7 moderation, with nothing to install. 18+.`,
    angle: {
      h2: "Half an hour apart, and the same evening",
      p: [
        "India is only thirty minutes ahead of Pakistan, so the app's busiest hours are your evening too. Spoken Hindi and Urdu are close enough that a call rarely needs English, though English works everywhere: cricket, films, food and music give you plenty to start with.",
        "Prefer people in India? Set the country filter to India and every match is at home. Leave it open and the next call could be Dhaka, Cairo or Toronto.",
      ],
    },
    timing: "Pakistan is thirty minutes behind India, so its busiest hours are your evening and late night:",
    faqs: [
      { q: `Does ${n} work in India?`, a: `Yes. Open ${n} in Chrome or Safari on your phone, or install the Android app. It runs on Jio, Airtel and Vi data or Wi-Fi, and adapts video to your connection.` },
      { q: "Can I meet only people from India?", a: "Yes. Set the country filter to India. Filters are free during the daily Vibe Hour and with VIP, and cost a few coins otherwise." },
      { q: "Can I talk in Hindi?", a: "Of course. Talk in Hindi, Urdu, English or whatever you both like. The app itself is in English for now." },
    ],
    keywords: ["video chat mumbai", "video chat delhi", "india video call app", "talk to strangers india", "omegle alternative india", "hindi video chat"],
    related: ["/video-chat-bangladesh/", "/video-chat-nepal/", "/omegle-alternative/"],
  },
  {
    slug: "video-chat-afghanistan",
    name: "Afghanistan",
    utc: 4.5,
    cities: ["Kabul", "Herat", "Kandahar", "Mazar-i-Sharif"],
    languages: ["Pashto", "Dari", "Urdu", "English"],
    h1: "Video chat in Afghanistan: Pashto, Dari and the world",
    lede: `${n} is free random video chat that works from Afghanistan. One tap puts you on live video with someone new, in Kabul, across the border in Peshawar or anywhere else. Real, selfie-verified people and calls that start blurred. Runs in your browser or on Android, 18+.`,
    angle: {
      h2: "Pashto on both sides of the border",
      p: [
        "Pakistan is half an hour ahead, so its busy evenings are yours too. Pashto is spoken on both sides, and many people who grew up in Peshawar or Quetta speak Urdu as well, so a call with someone in Pakistan often needs no English at all.",
        "Set the country filter to Afghanistan to meet people at home, or leave it open to practise English with people everywhere. If a call goes well, add each other as friends and keep talking in chat.",
      ],
    },
    timing: "Pakistan is thirty minutes ahead of Afghanistan, so Pakistani prime time is your evening:",
    faqs: [
      { q: "Does video chat work on Afghan mobile data?", a: `${n} adapts video quality to your connection, so a call keeps going on slower 3G or 4G data. Wi-Fi gives the sharpest picture.` },
      { q: "Can I talk in Pashto or Dari?", a: "Yes. Talk in any language you both like. Set the country filter to Afghanistan or Pakistan to find Pashto speakers more often." },
    ],
    keywords: ["video chat kabul", "pashto video chat", "dari video chat", "afghan video call app", "talk to strangers afghanistan"],
    related: ["/video-chat-pakistan/", "/practice-english-speaking/", "/safe-video-chat/"],
  },
  {
    slug: "video-chat-turkey",
    name: "Turkey",
    utc: 3,
    cities: ["Istanbul", "Ankara", "Izmir", "Bursa"],
    languages: ["Turkish", "English", "Arabic", "Urdu"],
    h1: "Video chat in Turkey: meet someone new tonight",
    lede: `${n} is free random video chat that works in Turkey. Tap Start and you're on camera with a real person in Istanbul, in Pakistan or anywhere in the world. Selfie verification, blurred call starts and 24/7 moderation are built in. No download, 18+.`,
    angle: {
      h2: "Two countries that already like each other",
      p: [
        "Turkish dramas are on every screen in Pakistan, and Pakistanis are among the friendliest visitors Turkey gets. Pakistan is only two hours ahead, so when your evening starts the app is at its busiest: a good moment to meet the people who know every episode of your favourite dizi.",
        "Set the country filter to Turkey to keep it local, or leave it open for people from Pakistan, the Gulf and everywhere else. English is the common language on most calls; Turkish, Arabic and Urdu all turn up too.",
      ],
    },
    timing: "Pakistan is two hours ahead of Turkey, so its busiest hours are your evening:",
    faqs: [
      { q: "Can I meet people from Turkey only?", a: "Yes. Set the country filter to Turkey." },
      { q: "Is random video chat safe in Turkey?", a: `${n} starts every random call blurred, verifies people with a selfie check, reviews reports 24/7 and is 18+ only.` },
    ],
    keywords: ["video chat istanbul", "turkey video call app", "talk to strangers turkey", "görüntülü sohbet", "omegle alternative turkey"],
    related: ["/video-chat-saudi-arabia/", "/video-chat-egypt/", "/random-video-chat/"],
  },
  {
    slug: "video-chat-indonesia",
    name: "Indonesia",
    utc: 7,
    zoneNote: "Jakarta time (WIB). Bali and Makassar are an hour later.",
    pkHours: [18, 19, 20, 21, 22],
    cities: ["Jakarta", "Surabaya", "Bandung", "Medan"],
    languages: ["Indonesian", "English", "Javanese", "Arabic"],
    h1: "Video chat in Indonesia: meet new people, live",
    lede: `${n} is free random video chat that works in Indonesia. One tap connects you on live video with someone new, in Jakarta, in Pakistan or anywhere in the world. Real, selfie-verified people, calls that start blurred, and nothing to install. 18+.`,
    angle: {
      h2: "The biggest phone-first country in Asia",
      p: [
        `Indonesia lives on its phones, and ${n} is built for that: open it in Chrome, tap Start, and you're talking. English is the common language on most calls, which makes it an easy way to practise, and there are more Indonesian speakers joining every week.`,
        "Indonesia is two hours ahead of Pakistan, so the app's busiest hours run late into your night. Set the country filter to Indonesia to meet people at home, or leave it open for Malaysia, Pakistan and the rest of the world.",
      ],
    },
    timing: "Indonesia is two hours ahead of Pakistan, so Pakistani evenings land late in yours:",
    faqs: [
      { q: "Can I meet Indonesians only?", a: "Yes. Set the country filter to Indonesia." },
      { q: "Does it work on Telkomsel, Indosat or XL data?", a: `Yes. ${n} runs on any mobile network or Wi-Fi and adapts video to your connection.` },
    ],
    keywords: ["video chat jakarta", "indonesia video call app", "talk to strangers indonesia", "video call random indonesia", "omegle alternative indonesia"],
    related: ["/video-chat-malaysia/", "/video-chat-philippines/", "/practice-english-speaking/"],
  },
  {
    slug: "video-chat-singapore",
    name: "Singapore",
    utc: 8,
    diaspora: true,
    cities: ["Jurong", "Tampines", "Woodlands", "Orchard"],
    languages: ["English", "Mandarin", "Malay", "Tamil"],
    h1: "Video chat in Singapore: one tap to someone new",
    lede: `${n} is free random video chat that works from Singapore. Tap Start and you're face to face with a real person in Singapore, Pakistan, the region or anywhere else. Selfie-verified badges, calls that start blurred and 24/7 moderation. No download, 18+.`,
    angle: {
      h2: "A small island with the whole world on the line",
      p: [
        "Singapore is three hours ahead of Pakistan, so Pakistan's busy evenings fall late in your night, and your own evening is Pakistan's afternoon. Plenty of people from Pakistan and South Asia work and study in Singapore; the country filter set to Pakistan is a quick way to hear Urdu after a long day.",
        "Leave the filter off and you'll meet Malaysia, Indonesia, the Philippines and everywhere beyond. English is the common language on almost every call.",
      ],
    },
    timing: "Singapore is three hours ahead of Pakistan, so Pakistani evenings run late into your night:",
    faqs: [
      { q: "Does video chat work in Singapore?", a: `Yes. ${n} runs in your browser or the Android app on Singtel, StarHub, M1 or Wi-Fi.` },
      { q: "Can I talk to people in Pakistan from Singapore?", a: "Yes. Set the country filter to Pakistan, or leave it open to meet anyone." },
    ],
    keywords: ["singapore video call app", "talk to strangers singapore", "pakistani in singapore", "random video chat singapore"],
    related: ["/video-chat-malaysia/", "/video-chat-indonesia/", "/make-friends-app/"],
  },
  {
    slug: "video-chat-new-zealand",
    name: "New Zealand",
    short: "New Zealand",
    utc: 12,
    dst: true,
    pkHours: [12, 13, 14, 15, 16],
    diaspora: true,
    cities: ["Auckland", "Wellington", "Christchurch", "Hamilton"],
    languages: ["English", "Urdu", "Hindi", "Punjabi"],
    h1: "Video chat in New Zealand: meet someone new, anywhere",
    lede: `${n} is free random video chat that works from New Zealand. Tap Start and you're on camera with a real person in Auckland, Pakistan or anywhere in the world. Selfie verification, blurred call starts and 24/7 moderation, with nothing to install. 18+.`,
    angle: {
      h2: "Your evening is Pakistan's afternoon",
      p: [
        "New Zealand is seven hours ahead of Pakistan, so Pakistan's late-night rush falls in your early morning. Your own evening is Pakistan's lunchtime and afternoon: quieter, but students and people home early are around, and it's the easiest time to catch family and friends back home.",
        "Set the country filter to New Zealand to meet people nearby, or leave it open for Australia, the Philippines, Pakistan and everywhere else.",
      ],
    },
    timing: "Pakistan is seven hours behind New Zealand (eight during NZ daylight saving). Pakistani afternoons are your evenings:",
    faqs: [
      { q: "When is the best time to video chat from New Zealand?", a: "Your evening is Pakistan's afternoon, which works well. The busiest Pakistani hours fall around 3 to 7 am in Auckland." },
      { q: "Can I meet people in Pakistan from New Zealand?", a: "Yes. Set the country filter to Pakistan, or leave it open to meet anyone." },
    ],
    keywords: ["video chat auckland", "pakistani in new zealand", "random video chat nz", "make friends new zealand"],
    related: ["/video-chat-australia/", "/video-chat-philippines/", "/random-video-chat/"],
  },

  // Pakistanis abroad — the rest of Europe.
  {
    slug: "video-chat-france",
    name: "France",
    utc: 1,
    dst: true,
    diaspora: true,
    cities: ["Paris", "Marseille", "Lyon", "Lille"],
    languages: ["French", "English", "Urdu", "Arabic"],
    h1: "Video chat in France: meet new people, near or back home",
    lede: `${n} is free random video chat that works from France. One tap connects you on live video with a real person in Paris, in Pakistan or anywhere else. Calls start blurred, people can be selfie-verified, and there's nothing to download. 18+.`,
    angle: {
      h2: "Paris evenings, Pakistani nights",
      p: [
        "Pakistan is four hours ahead of France (three in summer), so when you get home in the evening, Pakistan's busiest hours are already in full swing. The Pakistani community around Paris keeps growing; set the country filter to Pakistan and you're hearing Urdu in seconds.",
        "New to France? A few friendly calls make a new city feel smaller, and you can practise your French or English with people who don't mind a mistake. Set the filter to France for people nearby, or leave it open for the world.",
      ],
    },
    timing: "Pakistan is four hours ahead of Paris (three in summer), so its busiest hours are your evening:",
    faqs: [
      { q: "Can I meet people in Pakistan from France?", a: "Yes. Most people on the app are in Pakistan today. Set the country filter to Pakistan to meet only them." },
      { q: "Is random video chat safe in France?", a: `${n} starts every random call blurred, gives real people a selfie-verified badge, keeps a report button on screen with 24/7 review, and is 18+ only.` },
    ],
    keywords: ["video chat paris", "pakistani in france", "chat vidéo aléatoire", "make friends france", "random video chat france"],
    related: ["/video-chat-italy/", "/video-chat-germany/", "/video-chat-uk/"],
  },
  {
    slug: "video-chat-spain",
    name: "Spain",
    utc: 1,
    dst: true,
    diaspora: true,
    cities: ["Barcelona", "Madrid", "Valencia", "Zaragoza"],
    languages: ["Spanish", "Catalan", "English", "Urdu"],
    h1: "Video chat in Spain: Barcelona to Lahore in one tap",
    lede: `${n} is free random video chat that works from Spain. Tap Start and you're face to face with someone new, in Barcelona, in Pakistan or anywhere in the world. Selfie-verified badges, calls that start blurred and 24/7 moderation. No download, 18+.`,
    angle: {
      h2: "One of Europe's biggest Pakistani communities",
      p: [
        "Barcelona has one of the largest Pakistani communities in Europe, with many families from Gujrat, Sialkot and Mandi Bahauddin. Pakistan is four hours ahead (three in summer), so your evening is Pakistan's busiest time: set the country filter to Pakistan and you're talking to home before dinner.",
        "Want to practise Spanish or meet people in Spain? Set the filter to Spain, or leave it open and let the next call surprise you.",
      ],
    },
    timing: "Pakistan is four hours ahead of Spain (three in summer), so its busiest hours are your evening:",
    faqs: [
      { q: "Can I talk to people in Pakistan from Spain?", a: "Yes. Set the country filter to Pakistan, or leave it open to meet anyone." },
      { q: "Can I use Urdu or Punjabi on video chat?", a: "Yes. Talk in whatever language you both like. Most people on the app are in Pakistan, so Urdu and Punjabi are common." },
    ],
    keywords: ["video chat barcelona", "pakistani in spain", "videochat aleatorio", "make friends spain", "random video chat spain"],
    related: ["/video-chat-italy/", "/video-chat-france/", "/video-chat-pakistan/"],
  },
  {
    slug: "video-chat-netherlands",
    name: "the Netherlands",
    inName: "the Netherlands",
    short: "Netherlands",
    utc: 1,
    dst: true,
    diaspora: true,
    cities: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht"],
    languages: ["Dutch", "English", "Urdu"],
    h1: "Video chat in the Netherlands: meet someone new tonight",
    lede: `${n} is free random video chat that works from the Netherlands. One tap puts you on live video with a real person in Amsterdam, Pakistan or anywhere else. Calls start blurred, people can be selfie-verified, and nothing needs installing. 18+.`,
    angle: {
      h2: "Where everyone already speaks English",
      p: [
        "The Netherlands is full of international students and people who moved for work, and nearly everyone speaks English, which makes random video chat with the rest of the world easy. Pakistan is four hours ahead (three in summer), so your evening is its busiest time.",
        "Set the country filter to Pakistan for a conversation in Urdu after a long day, to the Netherlands for people nearby, or leave it open for the world.",
      ],
    },
    timing: "Pakistan is four hours ahead of Amsterdam (three in summer), so its busiest hours are your evening:",
    faqs: [
      { q: "Can I meet people in Pakistan from the Netherlands?", a: "Yes. Set the country filter to Pakistan, or leave it open to meet anyone." },
      { q: "Is random video chat safe in the Netherlands?", a: `${n} starts every random call blurred, verifies people with a selfie check, reviews reports 24/7 and is 18+ only.` },
    ],
    keywords: ["video chat amsterdam", "pakistani in netherlands", "make friends netherlands", "random video chat netherlands"],
    related: ["/video-chat-germany/", "/video-chat-uk/", "/make-friends-app/"],
  },
  {
    slug: "video-chat-sweden",
    name: "Sweden",
    utc: 1,
    dst: true,
    diaspora: true,
    cities: ["Stockholm", "Gothenburg", "Malmö", "Uppsala"],
    languages: ["Swedish", "English", "Urdu"],
    h1: "Video chat in Sweden: long winters, warm conversations",
    lede: `${n} is free random video chat that works from Sweden. Tap Start and you're face to face with someone new, in Stockholm, in Pakistan or anywhere in the world. Selfie verification, blurred call starts and 24/7 moderation are built in. No download, 18+.`,
    angle: {
      h2: "Dark at four, company at eight",
      p: [
        "Swedish winters are long and dark, and a video chat with someone far away is a good way to spend an evening. Pakistan is four hours ahead (three in summer), so when your evening starts the app is at its busiest; many Pakistani students and engineers in Sweden use the country filter to hear Urdu after work.",
        "Set the filter to Sweden to meet people nearby, or leave it open for the world. English is the common language on nearly every call.",
      ],
    },
    timing: "Pakistan is four hours ahead of Stockholm (three in summer), so its busiest hours are your evening:",
    faqs: [
      { q: "Can I meet people in Pakistan from Sweden?", a: "Yes. Set the country filter to Pakistan, or leave it open to meet anyone." },
      { q: "Can I talk in Urdu or Punjabi?", a: "Yes. Talk in any language you both like. Most people on the app are in Pakistan, so Urdu and Punjabi are common." },
    ],
    keywords: ["video chat stockholm", "pakistani in sweden", "make friends sweden", "random video chat sweden"],
    related: ["/video-chat-norway/", "/video-chat-germany/", "/video-chat-pakistan/"],
  },
];

export const COUNTRY_PAGES: KeywordPage[] = COUNTRIES.map(countryPage);

/* ── Pakistani cities ────────────────────────────────────────────────────── */

type City = {
  slug: string;
  name: string;
  /** When the plain name is ambiguous in search results ("Hyderabad"). */
  title?: string;
  h1: string;
  lede: string;
  angle: { h2: string; p: string[] };
  faqs: Faq[];
  keywords: string[];
  related: string[];
};

function cityPage(c: City): KeywordPage {
  const lc = c.name.toLowerCase();
  return {
    slug: c.slug,
    group: "city",
    navLabel: c.name,
    title: c.title ?? `Video Chat ${c.name}: Meet New People Live`,
    description: `Free live video chat in ${c.name}: meet real, selfie-verified people from ${c.name}, across Pakistan or worldwide. Cash out to JazzCash or Easypaisa. 18+.`,
    keywords: [`video chat ${lc}`, `random video chat ${lc}`, `make friends in ${lc}`, `meet new people ${lc}`, `online friends ${lc}`, `video call app ${lc}`, ...c.keywords],
    kicker: `Video chat in ${c.name}`,
    h1: c.h1,
    lede: c.lede,
    blocks: [
      { h2: c.angle.h2 },
      ...c.angle.p.map((p) => ({ p })),
      { h2: `How to meet people from ${c.name}` },
      {
        p: `There's no city filter, but there's a country filter. Set it to **Pakistan** and every match is someone in Pakistan, often from ${c.name} and the cities around it, since most people on ${n} are Pakistani. Leave it off to meet the rest of the world.`,
      },
      { h2: "Pay and get paid in rupees" },
      {
        p: `Buy coins in PKR with JazzCash, Easypaisa or bank transfer. When someone sends you a gift, half its value becomes gems you can cash out to your JazzCash or Easypaisa number or a bank account. Step by step: [how to cash out](/blog/cash-out-jazzcash-easypaisa/).`,
      },
      { cta: { title: `Start video chatting in ${c.name}`, body: "Free to match. Pay and get paid in PKR. 18+ only." } },
      { h2: "Safe by default" },
      {
        ul: [
          "Every random call starts blurred for a few seconds.",
          "Selfie-verified badges, and a verified-only mode.",
          "Report in two taps; reports are reviewed 24/7.",
          "18+ only, always.",
        ],
      },
    ],
    faqs: [
      ...c.faqs,
      { q: `Is ${n} free in ${c.name}?`, a: "Yes. Matching, chatting and video calls with friends are free. Coins and VIP are optional." },
    ],
    related: [...c.related, "/video-chat-pakistan/"],
    updated: UPDATED,
  };
}

const CITIES: City[] = [
  {
    slug: "video-chat-karachi",
    name: "Karachi",
    h1: "Video chat in Karachi: meet someone new tonight",
    lede: `${n} is free random video chat for Karachi. Tap Start and you're face to face with someone new, from Clifton to Gulshan, across Pakistan or anywhere in the world. Real, selfie-verified people, calls that start blurred, and it works on any phone. 18+.`,
    angle: {
      h2: "A city that never runs out of things to say",
      p: [
        "Karachi is Pakistan's biggest city and one of its busiest on the app. Late nights, long commutes and a city full of people from every corner of the country make for good conversations.",
        "Talk in Urdu, Sindhi, Pashto or English, share where to get the best biryani, or meet someone from a city you've never visited.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Karachi?", a: "Set the country filter to Pakistan. There's no city filter, but Karachi is one of the busiest cities on the app." },
      { q: "Does it work on Jazz, Zong or Telenor data?", a: `Yes. ${n} works on any mobile network or Wi-Fi and adapts video to your connection.` },
    ],
    keywords: ["karachi video call", "karachi friends online", "online dost karachi"],
    related: ["/video-chat-lahore/", "/video-chat-islamabad/", "/earn-money-video-chat/"],
  },
  {
    slug: "video-chat-lahore",
    name: "Lahore",
    h1: "Video chat in Lahore: new people, one tap away",
    lede: `${n} is free random video chat for Lahore. One tap connects you on live video with someone new, in Lahore, across Punjab or around the world. Selfie-verified badges, calls that start blurred, and nothing to install. 18+.`,
    angle: {
      h2: "Zinda dilan da shehar",
      p: [
        "Lahore loves to talk, and a random video chat is the closest thing to a late-night chai with a stranger. Meet people from Punjab and the rest of Pakistan, or from the other side of the world.",
        "Students, freelancers and night owls: the busiest hours are evenings, and there's a Vibe Hour every day when every filter is free.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Lahore?", a: "Set the country filter to Pakistan. There's no city filter yet, but Lahore is one of the top cities on the app." },
      { q: "Can I talk in Punjabi?", a: "Of course. Talk in whatever language you both like." },
    ],
    keywords: ["lahore video call", "lahore friends online", "online dost lahore", "punjabi video chat"],
    related: ["/video-chat-karachi/", "/video-chat-islamabad/", "/blog/make-friends-online-pakistan/"],
  },
  {
    slug: "video-chat-islamabad",
    name: "Islamabad",
    h1: "Video chat in Islamabad and Rawalpindi",
    lede: `${n} is free random video chat for Islamabad and Rawalpindi. Tap Start and you're on camera with someone new, in the twin cities, across Pakistan or anywhere in the world. Real, selfie-verified people and calls that start blurred. 18+.`,
    angle: {
      h2: "The twin cities, and the rest of the world",
      p: [
        "Islamabad and Rawalpindi are full of students, professionals and people who moved from somewhere else, which makes them some of the most active cities on the app.",
        "Use video chat to practise English before an interview, meet people from other cities, or just talk to someone new after a long day.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Islamabad?", a: "Set the country filter to Pakistan. There's no city filter, but Islamabad is one of the busiest cities on the app." },
      { q: "Is it good for practising English?", a: "Yes. Leave the country filter off to meet people from many countries. See our [practise English speaking](/practice-english-speaking/) guide." },
    ],
    keywords: ["video chat rawalpindi", "islamabad video call", "online dost islamabad", "twin cities friends"],
    related: ["/video-chat-lahore/", "/video-chat-karachi/", "/practice-english-speaking/"],
  },
  {
    slug: "video-chat-faisalabad",
    name: "Faisalabad",
    h1: "Video chat in Faisalabad: the funniest city on the app",
    lede: `${n} is free random video chat for Faisalabad. Tap Start and you're face to face with someone new, from D Ground to Jaranwala Road, across Punjab or anywhere in the world. Real, selfie-verified people, calls that start blurred, and it works on any phone. 18+.`,
    angle: {
      h2: "Jugat ka shehar",
      p: [
        "Faisalabad is famous for two things: textiles and jugat, the quick Punjabi one-liner. Both travel well on a video call. Students from UAF and GCUF, mill workers finishing a shift and night owls from Peoples Colony make it one of the busiest cities in Punjab on the app.",
        "Talk in Punjabi or Urdu with someone across the city, or leave the country filter off and try your jokes on the rest of the world.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Faisalabad?", a: "Set the country filter to Pakistan. There's no city filter, but Faisalabad is one of the busiest cities in Punjab on the app." },
      { q: "Does it work on slow data?", a: `Yes. ${n} adapts video to your connection, so a call keeps going on 3G or a weak 4G signal.` },
    ],
    keywords: ["faisalabad video call", "faisalabad friends online", "online dost faisalabad", "lyallpur video chat"],
    related: ["/video-chat-lahore/", "/video-chat-multan/", "/blog/make-friends-online-pakistan/"],
  },
  {
    slug: "video-chat-peshawar",
    name: "Peshawar",
    h1: "Video chat in Peshawar: Pashto, Urdu and the world",
    lede: `${n} is free random video chat for Peshawar. One tap connects you on live video with someone new, in Peshawar, across Khyber Pakhtunkhwa or anywhere in the world. Selfie-verified badges, calls that start blurred, and nothing to install. 18+.`,
    angle: {
      h2: "The city of storytellers",
      p: [
        "Peshawar has been a city of conversation since the days of Qissa Khwani Bazaar. On the app that means Pashto and Urdu calls with people across KP, and plenty of people on the other side of the border who speak Pashto too.",
        "Set the country filter to Pakistan to stay close to home, or leave it off to meet Afghanistan, the Gulf and the rest of the world. Many people from Peshawar use it to keep their English sharp before going abroad.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Peshawar?", a: "Set the country filter to Pakistan. There's no city filter, but Peshawar is the busiest city in KP on the app." },
      { q: "Can I talk in Pashto?", a: "Yes. Talk in whatever language you both like. Leave the country filter off to meet Pashto speakers in Afghanistan as well." },
    ],
    keywords: ["peshawar video call", "pashto video chat", "online dost peshawar", "kpk video chat"],
    related: ["/video-chat-islamabad/", "/video-chat-afghanistan/", "/video-chat-quetta/"],
  },
  {
    slug: "video-chat-multan",
    name: "Multan",
    h1: "Video chat in Multan: late nights, new faces",
    lede: `${n} is free random video chat for Multan and South Punjab. Tap Start and you're on camera with someone new, in Multan, across Pakistan or anywhere in the world. Real, selfie-verified people and calls that start blurred. 18+.`,
    angle: {
      h2: "City of saints, and of very late evenings",
      p: [
        "Multan's summers push life late into the night, and that's exactly when the app is busiest. Students from BZU, people from Bahawalpur and DG Khan and the whole Saraiki belt are around after ten.",
        "Talk in Saraiki, Punjabi or Urdu with someone nearby, or leave the country filter off and meet the world. Sohan halwa recommendations welcome.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Multan?", a: "Set the country filter to Pakistan. There's no city filter, but South Punjab is well represented on the app." },
      { q: "Can I talk in Saraiki?", a: "Of course. Talk in whatever language you both like." },
    ],
    keywords: ["multan video call", "saraiki video chat", "online dost multan", "south punjab video chat"],
    related: ["/video-chat-bahawalpur/", "/video-chat-lahore/", "/earn-money-video-chat/"],
  },
  {
    slug: "video-chat-bahawalpur",
    name: "Bahawalpur",
    h1: "Video chat in Bahawalpur: meet someone new tonight",
    lede: `${n} is free random video chat for Bahawalpur. One tap puts you face to face with someone new, in Bahawalpur, across Pakistan or anywhere in the world. Selfie-verified people, calls that start blurred, and it works on any phone. 18+.`,
    angle: {
      h2: "Small city, big on the app",
      p: [
        `For its size, Bahawalpur is one of the most active cities on ${n}, thanks to thousands of students at the Islamia University and a lot of long, quiet evenings. If you're one of them, you're in good company.`,
        "Talk in Saraiki, Punjabi or Urdu with people across South Punjab, or leave the country filter off to practise English with someone on the other side of the world.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Bahawalpur?", a: "Set the country filter to Pakistan. There's no city filter, but Bahawalpur punches above its weight on the app." },
      { q: "Does it work on Jazz or Zong data?", a: `Yes. ${n} works on any mobile network or Wi-Fi and adapts video to your connection.` },
    ],
    keywords: ["bahawalpur video call", "online dost bahawalpur", "iub friends online", "cholistan video chat"],
    related: ["/video-chat-multan/", "/video-chat-lahore/", "/practice-english-speaking/"],
  },
  {
    slug: "video-chat-hyderabad",
    name: "Hyderabad",
    title: "Video Chat Hyderabad, Sindh: Meet New People Live",
    h1: "Video chat in Hyderabad, Sindh",
    lede: `${n} is free random video chat for Hyderabad, Sindh. Tap Start and you're on live video with someone new, in Hyderabad, down the road in Karachi, across Pakistan or anywhere in the world. Real, selfie-verified people and calls that start blurred. 18+.`,
    angle: {
      h2: "Sindhi, Urdu and an hour from Karachi",
      p: [
        "Hyderabad sits close enough to Karachi to share its late nights, with its own mix of Sindhi and Urdu. Students from Jamshoro and people from Qasimabad, Latifabad and across interior Sindh are on the app most evenings.",
        "Set the country filter to Pakistan to stay close to home, or leave it off and meet the world.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Hyderabad, Sindh?", a: "Set the country filter to Pakistan. There's no city filter, but Hyderabad and Karachi together are the busiest part of Sindh on the app." },
      { q: "Can I talk in Sindhi?", a: "Yes. Talk in whatever language you both like." },
    ],
    keywords: ["hyderabad sindh video chat", "sindhi video chat", "online dost hyderabad", "qasimabad video call", "jamshoro friends online"],
    related: ["/video-chat-karachi/", "/video-chat-quetta/", "/blog/make-friends-online-pakistan/"],
  },
  {
    slug: "video-chat-gujranwala",
    name: "Gujranwala",
    h1: "Video chat in Gujranwala: new people, one tap away",
    lede: `${n} is free random video chat for Gujranwala. One tap connects you on live video with someone new, in Gujranwala, across Punjab or around the world. Selfie-verified badges, calls that start blurred, and nothing to install. 18+.`,
    angle: {
      h2: "The city that feeds half of Punjab",
      p: [
        "Gujranwala is known for its food and its wrestlers, and for the many families with someone working in Italy, Spain or the Gulf. On the app that means Punjabi calls with people in the city and Urdu calls with relatives' cities abroad.",
        "Set the country filter to Pakistan for someone nearby, to Italy or Spain to hear from the diaspora, or leave it open for the world.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Gujranwala?", a: "Set the country filter to Pakistan. There's no city filter, but central Punjab is one of the busiest regions on the app." },
      { q: "Can I talk in Punjabi?", a: "Of course. Talk in whatever language you both like." },
    ],
    keywords: ["gujranwala video call", "online dost gujranwala", "gujranwala friends online", "punjabi video chat gujranwala"],
    related: ["/video-chat-sialkot/", "/video-chat-lahore/", "/video-chat-italy/"],
  },
  {
    slug: "video-chat-sialkot",
    name: "Sialkot",
    h1: "Video chat in Sialkot: from the export city to the world",
    lede: `${n} is free random video chat for Sialkot. Tap Start and you're face to face with someone new, in Sialkot, in Europe where half the city has family, or anywhere in the world. Real, selfie-verified people and calls that start blurred. 18+.`,
    angle: {
      h2: "A city with family everywhere",
      p: [
        "Sialkot sells footballs and surgical tools to the whole world, and sends its people to Norway, Spain, Italy and Germany. Few Pakistani cities have more reasons to talk to someone abroad, in Punjabi, Urdu or the English you need for the next export order.",
        "Set the country filter to Pakistan for someone nearby, to a European country to meet people where your cousins live, or leave it open and see who's out there.",
      ],
    },
    faqs: [
      { q: "Can I meet people from Sialkot?", a: "Set the country filter to Pakistan. There's no city filter, but Sialkot and Gujranwala are well represented on the app." },
      { q: "Is it good for practising business English?", a: "Yes. Leave the country filter off to meet people from many countries. See our [practise English speaking](/practice-english-speaking/) guide." },
    ],
    keywords: ["sialkot video call", "online dost sialkot", "sialkot friends online", "sialkot pakistani in norway"],
    related: ["/video-chat-gujranwala/", "/video-chat-norway/", "/practice-english-speaking/"],
  },
  {
    slug: "video-chat-quetta",
    name: "Quetta",
    h1: "Video chat in Quetta: Balochistan to the world",
    lede: `${n} is free random video chat for Quetta. One tap puts you on live video with someone new, in Quetta, across Balochistan and Pakistan or anywhere in the world. Selfie-verified people, calls that start blurred, and it keeps working on a slow connection. 18+.`,
    angle: {
      h2: "Cool evenings, a long way from everywhere",
      p: [
        "Quetta is far from Pakistan's other big cities, and a video call closes that distance. Talk in Balochi, Pashto, Brahui, Hazaragi or Urdu with people across the province, or meet someone in Karachi or Lahore who has never seen snow.",
        `Internet in Balochistan isn't always fast. ${n} adapts video to your connection, so a call keeps going on 3G and sharpens up on Wi-Fi.`,
      ],
    },
    faqs: [
      { q: "Can I meet people from Quetta?", a: "Set the country filter to Pakistan. There's no city filter, but Balochistan is well represented in the evenings." },
      { q: "Does it work on slow data?", a: `Yes. ${n} lowers video quality on a weak signal instead of dropping the call.` },
    ],
    keywords: ["quetta video call", "balochistan video chat", "online dost quetta", "hazara video chat", "balochi video chat"],
    related: ["/video-chat-karachi/", "/video-chat-peshawar/", "/video-chat-afghanistan/"],
  },
];

export const CITY_PAGES: KeywordPage[] = CITIES.map(cityPage);

/* ── Hub: every country on one page ──────────────────────────────────────── */

export function countryHub(pakistan: KeywordPage): KeywordPage {
  const rows = [
    ["Pakistan", "10:00 pm", `[Video chat in Pakistan](/${pakistan.slug}/)`],
    ...COUNTRIES.map((c) => [c.short ?? c.name.replace(/^the /, ""), clock(22 - 5 + c.utc), `[Video chat in ${c.inName ?? c.name}](/${c.slug}/)`]),
  ];
  return {
    slug: "video-chat-by-country",
    navLabel: "All countries",
    title: "Video Chat by Country: Meet People Worldwide",
    description: `Free random video chat by country: pick yours to see when people are online, how to meet locals or Pakistan, and what works where. ${n}, 18+.`,
    keywords: ["video chat by country", "video chat with people from other countries", "international video chat", "meet people from different countries", "worldwide video chat"],
    kicker: "Video chat by country",
    h1: "Video chat by country: meet people from anywhere",
    lede: `${n} is random video chat for the whole world, with a country filter for when you want somewhere specific. Find your country below to see when people are online and how to meet people at home or in Pakistan.`,
    blocks: [
      { h2: "Pick your country" },
      {
        table: {
          head: ["Country", "Local time at 10 pm in Pakistan", "Guide"],
          rows,
          caption: "Standard time. Most people on the app are in Pakistan today, so Pakistani evenings are busiest.",
        },
      },
      { h2: "Cities in Pakistan" },
      { ul: CITIES.map((c) => `[Video chat in ${c.name}](/${c.slug}/)`) },
      { h2: "How the country filter works" },
      {
        p: "Set the filter to a country and every match is someone there. Leave it off and anyone in the world can be next. Filters are free during the daily Vibe Hour and with VIP, and cost a few coins otherwise.",
      },
      { cta: { title: "Meet someone from another country", body: "One tap, a real person somewhere new. Free, 18+." } },
    ],
    faqs: [
      { q: "Can I video chat with people from other countries?", a: `Yes. ${n} matches you with people worldwide by default. Use the country filter to choose one.` },
      { q: "Which countries are most active?", a: "Most people on the app are in Pakistan today, so Pakistani evenings are the busiest time." },
      { q: "Why isn't my country listed?", a: `${n} works anywhere video calls are allowed; these are just the countries we've written guides for. In the UAE, Qatar and Oman, networks restrict internet video calling, so calls may not connect there.` },
    ],
    related: ["/video-chat-pakistan/", "/random-video-chat/", "/omegle-alternative/", "/practice-english-speaking/"],
    updated: UPDATED,
  };
}
