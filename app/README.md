# Vibe

Random 1:1 video chat — meet someone new on video, swipe to the next — with coins, gifts, VIP and payments. Flutter app; the server lives next door in `../backend` (NestJS).

See `BUSINESS.md` for the economy and the revenue model.

## Run it

Two modes, same app:

```bash
# Offline demo — everything mocked on the device (no server needed)
flutter run

# Server mode — talkflutter run --dart-define=VIBE_API=http://10.0.2.2:3000  s to the Vibe API (see ../backend/README.md to start it)
    # Android emulator
flutter run --dart-define=VIBE_API=http://192.168.1.20:3000  # real phone: your PC's LAN IP
```

In server mode with the backend's dev settings, the e-mailed code is always `1234`. If nobody else is online, a scripted bot partner takes the call after a moment, so you can try matching with a single phone. Two phones match each other with live video over WebRTC.

`setup_vibe.sh` is safe to re-run; it only creates files that do not exist yet.

## Layout

```
lib/
  main.dart, app.dart           picks offline vs server mode; auth → onboarding → home routing
  core/api/                     ApiClient (REST + token refresh), RealtimeClient (Socket.IO), mappers, token store
  core/theme/                   V (tokens), VT (type), shared widgets
  core/mock/                    MockBackend + MockData — the offline demo
  models/models.dart            Profile, Wallet, CoinPack, VipPlan, Gift, Transaction, MatchFilters, Friend, ChatMessage, MatchRecord, TeamMessage, Economy
  models/engagement.dart        StreakView, VibeHour, LevelProgress, badges, Leaderboard, WeeklyRecap, Moment, GameRound, WellbeingSettings
  providers/                    Session / Wallet / Social / Match / Inbox / Follows / Engagement / Moments — each an abstract API with
                                *_local.dart (offline mock) and *_remote.dart (Vibe API) implementations
  screens/…                     unchanged by the mode: they only talk to providers
test/                           economy + match loop tests (offline), server_test.dart (against a running API)
```

## Tests

```bash
flutter test                                                        # offline rules
VIBE_API_TEST=http://127.0.0.1:3000 flutter test test/server_test.dart  # full flow against the server
# add VIBE_STAFF_EMAIL=… VIBE_STAFF_PASSWORD=… (an admin-panel account) to also check a team message arrives live
```

**Live prices.** In server mode the app loads `GET /catalog` after sign-in and again whenever staff change prices (`catalog:updated`), updates `Economy` and the pack/plan/gift lists, and redraws open screens. The offline demo uses the built-in defaults.

**Messages from Vibe.** Messages the team sends from the admin panel appear as a pinned row at the top of Chats (with an unread count, also on the Chats tab) and a banner if the app is open. Links in them open in the browser (`url_launcher`; on Android 11+ add an `https` `<queries>` intent to `AndroidManifest.xml`). **Profile → E-mail updates** turns off news e-mails; sign-in codes and important notices still arrive.

## Integrations (payments, sign-in, ads, push, photos)

All coded and switched on by build configuration only — see
[`INTEGRATIONS_APP.md`](INTEGRATIONS_APP.md) for every key, where to get it,
how to build (`--dart-define-from-file=.env`, template in `.env.example`)
and a test checklist. A build without keys runs: each integration is hidden
or replaced by a dev stand-in. Code: `lib/core/config/integrations_config.dart`
(keys), `lib/services/` (store billing, checkout controller, deep links,
social sign-in, rewarded ads, push, photo picking), wired in `main.dart`
through `AppServices`.

`android/` and `ios/` are tracked in git: they carry the native side of the
integrations (manifest placeholders, Info.plist, xcconfig).
