# Vibe — business model

Vibe is a random 1:1 video-chat app (Azar / Monkey / Omegle category): tap once, meet a stranger on video, swipe to the next. The app is free to use; money comes from four places, all of which are present in the mock build so the product can be judged end to end before a backend exists.

Every number below is also the number the app uses (`lib/core/mock/mock_data.dart` → `Economy`). Change it there and the whole app follows.

## 1. Coins (the in-app currency)

Coins are bought with real money and spent on things that make the next match better. Prices are in USD for the stores; the local-payment mock shows PKR at a fixed rate.

| Pack | Coins | Price | Per 100 coins | Tag |
|---|---|---|---|---|
| Starter | 100 | $0.99 | $0.99 | — |
| Popular | 550 | $4.99 | $0.91 | Most popular |
| Value | 1,200 | $9.99 | $0.83 | Best value |
| Pro | 3,000 | $24.99 | $0.83 | +10% bonus shown |
| Whale | 6,500 | $49.99 | $0.77 | +30% bonus shown |

What coins buy (per use):

| Feature | Cost | Why people pay |
|---|---|---|
| Gender filter (match only men / women) | 10 coins per match | The #1 driver in this category. VIP: free. |
| Region filter (a country or "near me") | 5 coins per match | Language and time-zone fit. VIP: free. |
| Reconnect (call the last person again) | 20 coins | Regret after a hasty swipe. |
| Friend request during a match | free ×3 per day, then 10 coins | Turns strangers into a contact list. |
| Skip cooldown bypass | 5 coins | After 5 skips in a minute the next swipe waits 10 s; coins skip the wait. |
| Boost (priority in the queue for 30 min) | 50 coins | Faster matches at quiet hours. |
| Gifts | 5–1,000 coins | See §2. |

## 2. Gifts → gems (the creator loop)

During a match either side can send a gift. The sender pays coins; the receiver earns **gems**, which are cash-out-able. This is what makes attractive, friendly users stay online: they get paid.

| Gift | Coins | Gems to receiver |
|---|---|---|
| Rose | 5 | 2 |
| Heart | 20 | 10 |
| Coffee | 50 | 25 |
| Fireworks | 100 | 50 |
| Crown | 500 | 250 |
| Rocket | 1,000 | 500 |

Rules: receiver gets **50 % of the coin value as gems**; 1 gem = **$0.005** at cash-out (so the platform keeps ~75 % of gift revenue after the store's 15–30 % cut). Cash-out from **5,000 gems ($25)** via JazzCash / Easypaisa / bank transfer, paid within 3 business days, KYC once above $100/month.

## 3. VIP (subscription)

| Plan | Price | Note |
|---|---|---|
| Weekly | $2.99 | Impulse tier |
| Monthly | $7.99 | Default, highlighted |
| Yearly | $49.99 | "Save 48 %" |

VIP includes: unlimited gender and region filters, no ads, **200 bonus coins every month**, "who liked you" list, priority in the matching queue, a VIP badge on the match screen, and profile visitors. A 3-day free trial on monthly (mocked as a flag).

## 4. Free coins (retention + ads)

Free users must feel the economy is fair, or they leave before ever paying.

- **Daily check-in**: 5, 10, 15, 20, 25, 30, 50 coins over a 7-day streak (resets if a day is missed).
- **Rewarded video ad**: 10 coins, up to 10 per day (mocked as a 5-second countdown). At a $8 eCPM, 10 ads ≈ $0.08 revenue for 100 coins — cheaper than selling them, fine for engagement.
- **Invite a friend**: 100 coins when the friend completes profile setup.
- **Complete your profile**: 50 coins once (photo + bio + interests).

## 5. Safety (a business requirement, not a nice-to-have)

The category dies on moderation. Vibe ships: 18+ gate at sign-up, report + block in two taps (with reasons matching the store policies), an auto-blur toggle for the first 3 seconds of every match (VIP can turn it off), a strike system (3 reports in 24 h = 24 h ban, mocked), and a "safe mode" that only matches verified profiles. Selfie verification is a mocked flow that grants a badge.

## 6. KPIs the mock reports on the profile page

- Matches per session, average match length, skip rate
- Conversion: free → first purchase, ARPPU, VIP share
- Gift volume, gems paid out, take rate
- Ads watched per free user per day

## Assumptions for the projection (illustrative)

10,000 DAU · 4 % pay monthly · ARPPU $6 → ~$72k/mo coin+VIP revenue; ads on the other 96 %: 3 rewarded ads/day at $8 eCPM → ~$7k/mo; gifts take-rate on top. Break-even needs ~2,500 DAU at the same ratios.
