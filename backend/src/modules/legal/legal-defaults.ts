/**
 * The first text of each legal page, written from what Vibe actually does
 * (see the code each section points at). Seeded once on start when a page is
 * missing; after that the admin panel (Legal pages) owns the text.
 * Placeholders: {{email}} contact address, {{site}} landing URL, {{app}} web app URL.
 * Not legal advice: have a lawyer review before relying on it.
 */
export type LegalSlug = 'terms' | 'privacy' | 'guidelines' | 'child-safety';
export const LEGAL_SLUGS: readonly LegalSlug[] = ['terms', 'privacy', 'guidelines', 'child-safety'];

export interface LegalDefault {
  slug: LegalSlug;
  title: string;
  summary: string;
  markdown: string;
}

const TERMS = `## 1. About these terms

Vibe is a video chat service run by **Fawad Iqbal** in Pakistan ("Vibe", "we", "us"). These terms are the agreement between you and us when you use the Vibe website ({{site}}), the web app ({{app}}) or the Vibe Android app. By creating an account or using Vibe you agree to these terms, our [Privacy Policy](/privacy/), our [Community Guidelines](/guidelines/) and our [Child Safety Standards](/child-safety/). If you don't agree, please don't use Vibe.

## 2. Who can use Vibe

- **You must be 18 or older.** Vibe is for adults only. We remove accounts we believe belong to someone under 18.
- You must give your real age and use photos of yourself.
- One account per person. You can't use Vibe if we've banned you before, or if the law where you live doesn't allow you to.

## 3. Your account

You sign in with your e-mail (a one-time code), Google, Apple or Facebook. Keep your sign-in safe; you're responsible for what happens on your account. You can delete your account at any time in the app (Me → Account → Delete account) or by e-mailing {{email}}.

## 4. Meeting people

Vibe connects you on live video with people you don't know, lets you browse and like profiles (Discover), and lets friends chat and call each other. Other people are not checked or vouched for by us, even when they show a "Verified" badge (that only means their selfie matched their photo). Be careful: don't share personal details, money or private images with people you meet, and leave any call that makes you uncomfortable.

- **Calls are never recorded by Vibe.** Video goes directly between the two people where possible, otherwise through our relay server, and is not stored.
- **Don't record, screenshot or share anyone** without their clear permission.
- Video can start blurred, and you can choose to meet verified people only.

## 5. The rules

Follow our [Community Guidelines](/guidelines/). In short: no nudity or sexual content, nothing involving anyone under 18, no harassment, hate, threats, scams or spam, and no selling or asking for money. **We have zero tolerance for child sexual abuse and exploitation** and report it to the authorities ([Child Safety Standards](/child-safety/)).

## 6. What you share

You keep ownership of the photos, text and voice notes you share. You give us permission to store, show and process them only as needed to run Vibe (for example, showing your profile to others and checking photos for nudity). We may remove anything that breaks these terms. Photos are checked automatically before others see them, and contact details (phone numbers, social handles) are hidden in chats to protect you from scams.

## 7. Keeping Vibe safe

You can report anyone in two taps and block them. We review reports and may warn, blur, pause or ban accounts, remove content, or stop payouts when the rules are broken, sometimes automatically. If we act on your account you can appeal in the app, and we'll look at it again. We may share information with the police or other authorities when the law requires it or when someone's safety is at risk.

## 8. Coins, VIP, gifts and gems

- **Coins** pay for extras such as filters, boosts and gifts. You can buy them or earn them for free (daily check-in, invites, completing your profile, watching an optional video in the Store). Coins have no cash value, can't be exchanged for money and are not refundable once spent.
- **VIP** is a monthly plan. Store subscriptions renew until you cancel them in Google Play; you can cancel at any time and keep VIP until the end of the period you paid for.
- **Payments** go through Google Play, JazzCash, Easypaisa, card or bank transfer. Prices are shown before you pay. Purchases are final except where the law or the store's own refund policy says otherwise. If you were charged and didn't get what you paid for, e-mail {{email}} and we'll sort it out.
- **Gifts and gems:** when someone sends you a gift, you receive gems. Gems can be cashed out (JazzCash, Easypaisa or bank) once you reach the minimum shown in the app. Larger cash-outs need selfie verification and may need ID. We may hold or refuse cash-outs linked to fraud, fake accounts or broken rules. You're responsible for any taxes on what you earn.
- Coins earned from ads or other free rewards can never be turned into money, directly or through gifts.

## 9. Ads

The Store offers an optional "watch a short video" ad that gives you coins; you choose when to watch. Our website may show ads from our ad partners. Ad partners' own terms and privacy policies apply to their ads.

## 10. Changes and availability

We keep improving Vibe and may change or stop features. We try to keep Vibe running but can't promise it will always be available or error-free. When we change these terms we update the date at the top; for important changes we'll tell you in the app or by e-mail before they apply. Using Vibe after a change means you accept the new terms.

## 11. Our responsibility

Vibe is provided "as is". As far as the law allows, we are not responsible for what other users say or do, or for indirect losses, and our total responsibility to you is limited to the amount you paid us in the 12 months before the claim. Nothing here limits rights you have by law that can't be limited.

## 12. Ending

You can stop using Vibe and delete your account at any time. We can suspend or close accounts that break these terms or put others at risk.

## 13. Law

These terms are governed by the laws of Pakistan, and disputes go to the courts of Pakistan, unless the law where you live gives you the right to use your local courts.

## 14. Contact

Questions about these terms: {{email}}.
`;

const PRIVACY = `## 1. Who we are

Vibe is run by **Fawad Iqbal** in Pakistan. We are responsible for the personal information described here. Contact: {{email}}.

## 2. What we collect

**When you sign up and use your profile**

- Your e-mail, or the account ID, name and e-mail Google, Apple or Facebook give us when you sign in with them.
- Your profile: name, age, gender, country, photos, bio, interests and what you're on Vibe for.
- If you verify: a selfie, which our own face-matching system compares with your profile photo. It's stored privately and only used for verification and safety reviews.

**When you use Vibe**

- Matches and calls: who you were matched or called with, when, for how long, and the filters you used. **We never record or store the video or audio of calls.**
- Chats with friends: messages, photos and voice notes you send.
- Likes, follows, friends, blocks, reports and appeals.
- Coins, gems, gifts, purchases and cash-outs. Card details are handled by the payment provider and are not stored by us. For cash-outs we store the JazzCash or Easypaisa number or bank IBAN you give us.

**From your device**

- IP address, device and browser type, app version and language, used for security and to show your country.
- A one-way scrambled device code, used to stop banned people from coming back and to prevent reward abuse.
- A push notification token if you allow notifications.

**On our website**

- Pages visited, how you arrived (for example from a search engine) and time on the page, counted by our own simple counter. Our website may show ads from Monetag, which may use cookies under its own privacy policy.

## 3. How we use it

- To run Vibe: matching, profiles, chats, calls, coins, VIP and cash-outs.
- To keep people safe: photos are checked automatically for nudity **on our own servers** before anyone sees them, contact details in chats are hidden, reports are reviewed, and rule-breakers are paused or banned. Some of these decisions are automatic; you can appeal any of them in the app.
- To prevent fraud and abuse of payments, rewards and cash-outs.
- To send you notifications and e-mails about your account, messages and activity (you can turn notifications off).
- To understand and improve Vibe using statistics.
- To meet legal obligations.

We don't sell your personal information.

## 4. Who sees it

- **Other people on Vibe** see your profile, what you send them, and your video during a call.
- **Service providers** that help us run Vibe, only for that purpose: Google (sign-in, Firebase push notifications, Google Play billing and the Gmail service we send e-mails through), Apple and Facebook (sign-in), payment providers (JazzCash, Easypaisa, our card gateway and banks), and ad networks (Monetag and Google AdMob) when you choose to watch a video ad. Photos, files and data are stored on servers we run ourselves.
- **Authorities**, when the law requires it, to protect someone's safety, or when we report child sexual abuse material (see our [Child Safety Standards](/child-safety/)).

Your information may be processed outside your country, with the same protections.

## 5. How long we keep it

- Your account information stays while your account is open.
- When you delete your account we remove your name, e-mail, bio, profile photo and interests, disconnect your sign-ins and devices, and stop using your saved cash-out accounts right away, and your account shows as "Deleted user". Messages you sent stay in the other person's chat under that name.
- Blocked photos and the evidence about them are deleted after 30 days. Chats in which contact details were hidden are flagged for 30 days.
- We keep payment, cash-out and safety records (for example reports and bans) as long as needed for legal, tax and safety reasons.

## 6. Your choices and rights

- See and edit your profile in the app at any time.
- Delete your account in the app (Me → Account → Delete account) or by e-mailing {{email}}.
- Ask us for a copy of your information, or to correct or delete it, at {{email}}. We'll answer within 30 days.
- Turn off notifications in the app or your phone settings.
- If you live in the EU, UK or another place with privacy laws, you also have the rights those laws give you, including complaining to your local data protection authority.

## 7. Adults only

Vibe is only for people aged 18 or older. If we learn we have information from someone under 18, we close the account and delete it, except what we must keep to report abuse.

## 8. Security

We use encrypted connections, store private files (like verification selfies) separately from public ones, limit staff access and keep a log of staff actions. No system is perfectly secure, so please use a strong sign-in and tell us at {{email}} if you notice anything wrong.

## 9. Changes

When we change this policy we update the date at the top, and tell you in the app for important changes.

## 10. Contact

{{email}}
`;

const GUIDELINES = `Vibe works when everyone feels safe to say hi. These rules apply on camera, in photos, in your profile and in chats. Breaking them can get you warned, paused or banned.

## Be real

- Be yourself: your own photos, your real age, your real name or a nickname.
- **18+ only.** Never use Vibe if you're under 18, and never involve anyone under 18.
- One account per person. Don't pretend to be someone else.

## Keep it clean

- **No nudity or sexual content** on camera, in photos or in messages. Photos are checked automatically and the camera can start blurred.
- No sexual requests, especially from people who didn't ask.

## Be respectful

- No harassment, bullying, threats or stalking.
- No hate: nothing attacking people for their religion, ethnicity, nationality, gender, sexuality or disability.
- No violence, weapons, drugs or self-harm content. If you're struggling, please reach out to someone you trust or a local helpline.

## No scams, no spam

- Don't ask for or offer money, gifts outside Vibe, investments or "business opportunities".
- Don't advertise, sell, or send people to other apps or websites. Phone numbers, social handles and links are hidden in chats automatically to stop scams.
- No fake accounts, bots or cheating the coins, rewards or gifts.

## Respect privacy

- **Don't record, screenshot or share** anyone's video, photos or messages without their permission.
- Don't share other people's personal information.

## Nothing illegal

Don't use Vibe for anything illegal where you or the other person live.

## If something's wrong

- **Report** anyone in two taps, during a call, from their profile or in a chat. Reports are private.
- **Block** them so they can never reach you again.
- **Leave** any call at once with Next.
- In danger? Contact your local police first.

## What we do

We review reports, sometimes with automated tools, and may remove content, warn, blur, pause or ban accounts, and keep banned people from coming back. Serious cases, and anything involving children, are reported to the authorities ([Child Safety Standards](/child-safety/)). If we act on your account and you think we got it wrong, appeal in the app.

Questions about these rules: {{email}}.
`;

const CHILD_SAFETY = `Vibe is for adults only, and we have **zero tolerance for child sexual abuse and exploitation (CSAE)**. These standards explain what is banned, how we prevent it and how we respond. They apply to everyone on Vibe, everywhere.

## What is banned

- **Anyone under 18** using Vibe, or appearing on camera or in photos.
- **Child sexual abuse material (CSAM):** any image, video or other material that shows or sexualizes a minor, including drawn or AI-generated material.
- **Grooming:** building a relationship with a minor for sexual purposes, or asking minors for images, meetings or contact details.
- **Sextortion** or threats involving sexual images of a minor.
- Sexualizing minors in any way, including comments, roleplay and links.
- Trafficking or any other exploitation of children.

## How we prevent it

- Everyone must be 18 or older and confirm it when they sign up; our minimum age can never be set below 18. The Android app is restricted to adults on Google Play.
- Photos are checked automatically for nudity before anyone sees them, and the camera can start blurred.
- Optional selfie verification checks that people are who their photos show, and anyone can choose to meet verified people only.
- Contact details are hidden in chats, which makes it harder to move people to other apps.
- Accounts we believe belong to minors are closed, and banned people are kept from coming back.

## How to report

- **In the app:** tap Report during a call, on a profile or in a chat, and choose the reason. Reports involving minors are reviewed first.
- **By e-mail:** {{email}}. Please include the person's name or profile link and what happened. Don't send us images of abuse; describe them instead.
- If a child is in immediate danger, contact your local police right away.

## What we do

- We remove CSAE content and ban the accounts involved as soon as we know about it.
- We report confirmed child sexual abuse material to the [NCMEC CyberTipline](https://report.cybertip.org/) and to the relevant authorities, including Pakistan's National Cyber Crime Investigation Agency (NCCIA), as the law requires.
- We preserve information that authorities need for an investigation, as the law allows, and cooperate with law enforcement.
- We comply with the child safety laws that apply to us.

## Child safety contact

Our designated child safety point of contact is **Fawad Iqbal**, {{email}}. We aim to respond to child safety reports within 24 hours.
`;

export const LEGAL_DEFAULTS: readonly LegalDefault[] = [
  { slug: 'terms', title: 'Terms of Use', summary: 'The agreement between you and Vibe.', markdown: TERMS },
  { slug: 'privacy', title: 'Privacy Policy', summary: 'What we collect, why, who sees it and how long we keep it.', markdown: PRIVACY },
  { slug: 'guidelines', title: 'Community Guidelines', summary: 'How to be on Vibe: the rules on camera, in photos and in chats.', markdown: GUIDELINES },
  { slug: 'child-safety', title: 'Child Safety Standards', summary: 'Our zero-tolerance standards against child sexual abuse and exploitation.', markdown: CHILD_SAFETY },
];

export function fillDefaults(md: string, vars: { email: string; site: string; app: string }): string {
  return md.replace(/\{\{email\}\}/g, vars.email).replace(/\{\{site\}\}/g, vars.site).replace(/\{\{app\}\}/g, vars.app);
}
