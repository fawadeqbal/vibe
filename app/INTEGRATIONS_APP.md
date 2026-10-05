# Vibe app — integrations

Every third-party integration in the Flutter app is already coded. Each one
**switches on from build configuration alone** (no code changes) and, until
its keys are set, is hidden or replaced by a stand-in, so a build with no keys
runs fine. The backend side lives in `../backend` (see its README); this page
covers what the *app* needs.

| Integration | Turns on when | Without keys |
|---|---|---|
| Google Play / App Store billing | always on in server mode (product ids come from the server) | the server's dev store mode takes a stand-in receipt on devices without a store |
| JazzCash, Easypaisa, card, bank | the server enables them (`GET /payments/methods`) | not offered |
| Payouts (cash-outs) | the server enables the rails | — |
| Google sign-in | `GOOGLE_SERVER_CLIENT_ID` (+ `GOOGLE_IOS_CLIENT_ID` on iOS) | button hidden; **debug builds** show a "(dev)" button that sends a dev token |
| Sign in with Apple | iOS: the capability; Android: `APPLE_SERVICE_ID` + `APPLE_REDIRECT_URI` | as above |
| Facebook Login | `FACEBOOK_APP_ID` + `FACEBOOK_CLIENT_TOKEN` | as above |
| Push (FCM) | the `FIREBASE_*` values | push silently off |
| Rewarded ads (AdMob) | `ADMOB_REWARDED_ANDROID` / `_IOS` | debug: Google's test units; release: "Watch an ad" hidden (offline demo: mock ad) |
| Avatar / selfie upload | always (camera + gallery) | — |

The server decides which sign-in providers and payment methods exist; the app
shows a provider only if the server lists it **and** this build can run it.

## How configuration works

* **One file for Dart and Android:** `app/.env` (git-ignored; template in
  `.env.example`), passed with `--dart-define-from-file=.env`. Dart reads the
  keys with `String.fromEnvironment` (`lib/core/config/integrations_config.dart`).
  Gradle (`android/app/build.gradle.kts`) reads the native ones — AdMob app
  id, Facebook app id/client token — from the same defines (Flutter passes
  them to Gradle). Order: `-PKEY=…` / `gradle.properties` → dart-define →
  environment variable → safe default.
* **iOS native values** (Info.plist) come from
  `ios/Flutter/IntegrationsDefaults.xcconfig` (committed, safe defaults),
  overridden by `ios/Flutter/Integrations.xcconfig` (git-ignored; copy
  `Integrations.xcconfig.example`). Both are included from `Debug.xcconfig`
  / `Release.xcconfig`.
* No `google-services.json` / `GoogleService-Info.plist`: Firebase is
  initialised from the `FIREBASE_*` defines.
* Nothing in these files is secret — all of it ships inside the app. Server
  secrets (Play service account, App Store key, JazzCash salts, FCM service
  account, Apple sign-in key…) stay in the backend's environment.

## Building

```bash
cd app
cp .env.example .env            # then fill in what you have
flutter run --dart-define-from-file=.env
flutter build apk --release --dart-define-from-file=.env      # direct download / testing
flutter build appbundle --release --dart-define-from-file=.env  # Play upload: set VIBE_STORE_BUILD=play
flutter build ipa --release --dart-define-from-file=.env        # App Store: set VIBE_STORE_BUILD=appstore
```

**Store builds.** Google Play and the App Store require their own billing for
digital goods. A build with `VIBE_STORE_BUILD=play|appstore` sends
`X-App-Store` with every request; the server then offers only that store's
billing (unless staff allow local methods with `payments.localMethodsInStoreApps`),
and checkout goes straight to the store sheet. Leave it empty for direct APKs,
which may offer JazzCash, Easypaisa, card and bank transfer.

**Android release signing.** Put `storeFile`, `storePassword`, `keyAlias`,
`keyPassword` in `android/key.properties` (git-ignored). Without it release
builds use the debug key.

**Offline demo.** Without `VIBE_API` the app runs on the built-in mock as
before: mock checkout (OTP, bank details, declines), mock payout accounts,
mock ads, mock social buttons.

---

## Payments

### Google Play Billing (Android)

1. **Play Console → your app → Monetize → Products.**
   * *In-app products* (consumable): one per coin pack, id `coins_<packId>`
     (e.g. `coins_starter`), priced like the pack.
   * *Subscriptions*: one per VIP plan, id `vip_<planId>` (e.g.
     `vip_vip_month`), with a base plan (add a free-trial offer if the plan
     has trial days). The exact ids are in `GET /payments/methods` →
     `store.skus` and in the admin panel.
2. Server side: the Play service account and `GOOGLE_PLAY_PACKAGE` (backend
   README). Real-time developer notifications → the backend's webhook.
3. App: nothing to configure. The app buys with
   `obfuscatedAccountId = store.playAccountId` from the server, **never
   consumes** packs itself (`autoConsume: false`), sends the purchase token to
   `POST /payments/purchases`, and acknowledges only after the server said
   SUCCEEDED (the server consumes/acknowledges with Google). Unfinished
   purchases are picked up after every sign-in (`restorePurchases`).
4. Test with **license testers** (Play Console → Settings → License testing)
   on an internal-testing track build installed from Play.

### App Store (iOS)

1. App Store Connect → your app → *In-App Purchases*: consumables
   `coins_<packId>`; *Subscriptions*: one group with `vip_<planId>`.
2. Sign the *Paid Apps* agreement. Server side: the App Store Server API key
   and bundle id (backend README).
3. Xcode → Runner → *Signing & Capabilities* → **+ In-App Purchase**.
4. The app passes `appAccountToken = store.appleAccountToken`, sends the
   transaction id, and finishes the transaction once the server answered.
   Test with a Sandbox account (Settings → App Store → Sandbox Account).

### JazzCash, Easypaisa, card, bank transfer

Configured entirely on the server (merchant credentials, sandbox/live). The
app shows what `GET /payments/methods` lists:

* **Wallets** ask for the number (JazzCash also the last 6 CNIC digits), then
  show "Approve in your JazzCash/Easypaisa app" with live status
  (`payment:updated` + polling every 3 s while the screen is visible),
  *I've approved* and *Cancel*. In server dev mode the wallet asks for a code
  (any 4 digits). JazzCash also has "Pay on the JazzCash page instead"
  (hosted form, form-POSTed from an in-app WebView).
* **Card**: the gateway's hosted page opens in the in-app browser (Custom
  Tab / SFSafariViewController) and returns through
  `vibe://payment-return?purchase=…&status=…` (Android intent-filter, iOS URL
  type; `MainActivity` is `singleTask` so the tab closes on return).
* **Bank transfer**: bank, title, IBAN, reference and amount with copy
  buttons, an optional "your bank's reference" field, and a notification when
  staff confirm it.

Local methods show PKR (the server's `amount`), stores show USD.

**VIP management.** `GET /vip` says how VIP is billed; store subscriptions
show *Manage in Google Play / App Store* (the server's `manageUrl`) instead of
*Cancel VIP*.

## Payouts (gems → money)

Server-side rails only. In the app: Wallet → *Cash out* lists saved
JazzCash/Easypaisa numbers and IBANs (masked), adds one (number checked as
`03XXXXXXXXX`, IBAN mod-97 — same rules as the server), sets the default,
removes one, requests the cash-out, and shows history with live status
(`cashout:updated`). Above the monthly limit the server answers
`KYC_REQUIRED`; the app offers the selfie check right there.

## Sign-in

The buttons come from `GET /auth/providers` ∩ what the build can run. In
**debug builds** a provider the server offers but the app has no keys for
shows "Continue with X (dev)", which sends `dev:<random>:<name>` — accepted
only by a server whose `SOCIAL_VERIFIER` is in dev mode. *Profile → Sign-in
methods* lists linked providers, links another and unlinks (the server
refuses to remove the last way to sign in).

### Google (google_sign_in 7)

Google Cloud console → *APIs & Services* → *OAuth consent screen* (publish
it), then *Credentials → Create OAuth client ID*:

| Client | Settings | Goes to |
|---|---|---|
| **Web application** | — | `GOOGLE_SERVER_CLIENT_ID` (app) and the server's `GOOGLE_CLIENT_IDS` |
| **Android** | package `com.pingcrood.vibe_app` + SHA-1 of *each* signing key (debug: `keytool -list -v -keystore ~/.android/debug.keystore -storepass android`; release key; Play App Signing key from Play Console) | nothing — it just has to exist |
| **iOS** | bundle id `com.pingcrood.vibeApp` | `GOOGLE_IOS_CLIENT_ID` (app), its *reversed* id → `GOOGLE_REVERSED_CLIENT_ID` in `ios/Flutter/Integrations.xcconfig`, and the server's `GOOGLE_CLIENT_IDS` |

Put **both** the Web and iOS client ids in the server's `GOOGLE_CLIENT_IDS`.

### Sign in with Apple (sign_in_with_apple)

* **iOS**: Apple Developer → Identifiers → your App ID → enable *Sign in with
  Apple*. In `ios/Flutter/Integrations.xcconfig` set
  `CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements` (it declares Sign in
  with Apple and push), or add the capability in Xcode. No app keys. Server:
  bundle id in `APPLE_CLIENT_IDS`.
* **Android** (web flow): create a **Services ID** (`APPLE_SERVICE_ID`),
  enable Sign in with Apple on it, set the domain and the return URL
  `APPLE_REDIRECT_URI`. Add the Services ID to the server's
  `APPLE_CLIENT_IDS`. That return URL must be a server endpoint that answers
  Apple's form POST with a redirect to
  `intent://callback?<the POSTed fields>#Intent;package=com.pingcrood.vibe_app;scheme=signinwithapple;end`
  — **the backend does not have this endpoint yet** (see "Open items").
* The app sends Apple's identity token, authorization code, the **raw**
  nonce (Apple got its SHA-256) and, on the first sign-in only, the name.

### Facebook (flutter_facebook_auth 7)

Meta for Developers → create an app (type *Consumer*) → add *Facebook Login*.
*Settings → Basic*: App ID; *Settings → Advanced*: Client token.

* `.env`: `FACEBOOK_APP_ID`, `FACEBOOK_CLIENT_TOKEN` (Dart **and** Android
  manifest). iOS: the same two in `ios/Flutter/Integrations.xcconfig`.
* Android platform: package `com.pingcrood.vibe_app`, class
  `com.pingcrood.vibe_app.MainActivity`, key hashes
  (`keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore | openssl sha1 -binary | openssl base64`,
  plus the release / Play signing keys).
* iOS platform: bundle id `com.pingcrood.vibeApp`.
* iOS uses **Limited Login** (ID token + nonce, no tracking prompt); Android
  classic login (access token). Server: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`.
* The SDK's auto-init and event logging are off, so a key-less build never
  talks to Facebook.

## Push notifications (firebase_messaging)

1. Firebase console → create a project → *Add app*: Android
   (`com.pingcrood.vibe_app`) and iOS (`com.pingcrood.vibeApp`). You don't
   need to add the downloaded config files to the project — copy their values:

   | `.env` key | `google-services.json` | `GoogleService-Info.plist` |
   |---|---|---|
   | `FIREBASE_API_KEY` | `client[].api_key[].current_key` | `API_KEY` |
   | `FIREBASE_PROJECT_ID` | `project_info.project_id` | `PROJECT_ID` |
   | `FIREBASE_MESSAGING_SENDER_ID` | `project_info.project_number` | `GCM_SENDER_ID` |
   | `FIREBASE_ANDROID_APP_ID` | `client[].client_info.mobilesdk_app_id` | — |
   | `FIREBASE_IOS_APP_ID` | — | `GOOGLE_APP_ID` |
   | `FIREBASE_IOS_BUNDLE_ID` (optional) | — | `BUNDLE_ID` |

   (Android and iOS keys may differ; use the one for the platform you build,
   or one unrestricted key.)
2. iOS: Apple Developer → *Keys* → create an **APNs** key → upload it in
   Firebase → *Project settings → Cloud Messaging*. Enable *Push
   Notifications* (the entitlements file above) and *Background Modes →
   Remote notifications* (already in Info.plist).
3. Server: the FCM service account (backend README).

After sign-in the app asks for permission (Android 13+ / iOS), registers the
token (`POST /me/push-tokens` with app version and locale), re-registers on
token refresh and unregisters on sign-out. Taps open the right place
(`data.route`: chat → that chat, friends/inbox → Chats, wallet → Wallet,
store → Store). **Channels**: `messages`, `social`, `payments`, `inbox`
(= the server's `category`) are created natively in `MainActivity.kt`, so
people can mute each kind; `flutter_local_notifications` isn't needed
because the server only pushes when the app is not connected.

## Rewarded ads (google_mobile_ads)

1. AdMob → *Apps → Add app* (Android and iOS). The **app ids** go native:
   `ADMOB_APP_ID_ANDROID` (`.env` or Gradle property) and `ADMOB_APP_ID_IOS`
   (`ios/Flutter/Integrations.xcconfig`). Both default to Google's public
   test app ids — the SDK refuses to start without one.
2. *Ad units → Rewarded*: `ADMOB_REWARDED_ANDROID`, `ADMOB_REWARDED_IOS`.
   In each unit enable **Server-side verification** with the callback URL
   `https://<your API>/v1/webhooks/admob/ssv`. Server: `ADMOB_AD_UNIT_IDS`.
3. Publish `app-ads.txt` on your developer website.
4. iOS: refresh `SKAdNetworkItems` in `Info.plist` from Google's list before
   release.

The app loads a rewarded ad with `ServerSideVerificationOptions(userId: <Vibe
user id>, customData: <fresh nonce>)`, and after the reward claims
`POST /wallet/rewards/ad {adToken: nonce}`; on `AD_NOT_VERIFIED` it retries
once after 2 s (AdMob's callback can trail the reward). Debug builds use
Google's test units, which always fill.

## Avatar and selfie verification

No keys. The profile photo is taken or picked with `image_picker`, resized on
the device (≤ 1600 px, JPEG 85 %; re-encoded if still too large or not
JPEG/PNG/WebP) and uploaded to `POST /me/avatar` (field `file`, 5 MB max).
Selfie verification uses the front camera → `POST /me/verification` (field
`selfie`): approved adds the badge, pending shows "in review", rejected shows
the reason. Permissions: camera (already used for video), photo library
(iOS `NSPhotoLibraryUsageDescription`).

---

## Test checklist

Use a server in dev mode first (everything works without real accounts), then
switch each integration to live.

**Payments**
- [ ] Store tab → pack → checkout lists exactly the server's methods (Android: no App Store).
- [ ] Google Play (license tester): purchase completes, coins arrive, the pack can be bought again (consumed by the server). Kill the app right after paying → reopen → coins arrive, toast shows.
- [ ] Play "slow test card" (pending) → "Waiting for Google Play" → approve later → delivered.
- [ ] VIP via Play/App Store → VIP screen shows *Manage in Google Play/App Store* and opens the subscription page.
- [ ] iOS sandbox: buy, cancel the sheet (back to methods), interrupted purchase.
- [ ] JazzCash wallet: number + CNIC → approve on the phone → screen turns to *Coins added* by itself; *I've approved*; *Cancel*; leave the app and come back (polling resumes).
- [ ] JazzCash page: WebView opens, pays, closes itself, result shown.
- [ ] Card: hosted page in the in-app browser → returns to the app → result; cancel on the page → *Payment not completed*.
- [ ] Bank: copy buttons, send reference, staff marks paid → push + wallet updates.
- [ ] Declines show the server's reason; *Try again* starts a new attempt.
- [ ] `VIBE_STORE_BUILD=play` build: checkout opens the Play sheet directly.

**Payouts**
- [ ] Add JazzCash / Easypaisa / bank (bad number and bad IBAN rejected in the form), set default, remove.
- [ ] Cash out → history shows *Requested/Sending/Paid*; status updates live.
- [ ] Above the KYC limit: *Verify to cash out more* → selfie flow.

**Sign-in**
- [ ] Each provider signs up a new account, then signs back into the same one.
- [ ] Apple: name arrives on first sign-in; Android web flow returns to the app (needs the server callback).
- [ ] Profile → Sign-in methods: link Google/Facebook/Apple, unlink, unlinking the last method shows the server's message.
- [ ] Debug build with no keys: "(dev)" buttons work against a dev server.

**Push**
- [ ] Permission prompt after sign-in; token appears in the admin panel / DB.
- [ ] App in background: friend message → notification in the *Messages* channel → tap opens the chat.
- [ ] Payment/cash-out/inbox notifications route to Wallet/Store/Chats.
- [ ] Sign out → no more notifications on that device.

**Ads**
- [ ] Debug: test ad plays, reward claimed, "ads left today" decreases.
- [ ] Release with real units: SSV callback reaches the server; claim succeeds (retry path when slow).
- [ ] Release without units: *Watch an ad* is hidden.

**Media**
- [ ] Profile photo from camera and gallery (HEIC on iOS, huge PNG) uploads and shows.
- [ ] Selfie verification: approved / pending / rejected reason in Profile.

## Open items

* **Sign in with Apple on Android** needs a backend endpoint for
  `APPLE_REDIRECT_URI` that turns Apple's `form_post` into the
  `intent://callback?…;scheme=signinwithapple;end` redirect. Until then,
  leave `APPLE_SERVICE_ID` unset on Android (the button stays hidden); iOS is
  unaffected.
* iOS can't be built from Linux: run `pod install` / build on a Mac, enable
  the capabilities (In-App Purchase, Push, Sign in with Apple) and check the
  Info.plist values resolve.
