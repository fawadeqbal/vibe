import { useAffiliate } from "./affiliate";
import { useCatalog } from "./catalog";
import { useEngagement } from "./engagement";
import { useFollows } from "./follows";
import { useInbox } from "./inbox";
import { useMatch } from "./match";
import { useMoments } from "./moments";
import { useReferrals } from "./referrals";
import { realtime } from "./services";
import { useSession } from "./session";
import { useSocial } from "./social";
import { useWallet } from "./wallet";
import { startBreakReminder, stopBreakReminder } from "./wellbeing";

/**
 * App lifecycle (the Flutter `VibeApp` state): restore the session once,
 * open the socket and load everything on sign-in, close it and forget the
 * user's data on sign-out. Call `startApp()` once from the client.
 */
let started = false;
let live = false;

async function loadAll() {
  await useCatalog.getState().load();
  await Promise.allSettled([
    useWallet.getState().load(),
    useSocial.getState().load(),
    useFollows.getState().load(),
    useMatch.getState().load(),
    useInbox.getState().load(),
    useEngagement.getState().load(),
    useMoments.getState().load(),
    useSession.getState().syncTimezone(),
  ]);
}

function onSessionChanged(signedIn: boolean) {
  if (signedIn && !live) {
    live = true;
    realtime.connect();
    void loadAll();
    void useSession.getState().loadVerification();
    startBreakReminder();
  } else if (!signedIn && live) {
    live = false;
    realtime.disconnect();
    useMatch.getState().reset();
    useWallet.getState().reset();
    useSocial.getState().reset();
    useFollows.getState().reset();
    useInbox.getState().reset();
    useEngagement.getState().reset();
    useMoments.getState().reset();
    useReferrals.getState().reset();
    useAffiliate.getState().reset();
    stopBreakReminder();
  }
}

export function startApp() {
  if (started) return;
  started = true;
  // An invite link (?ref=CODE&s=SOURCE) can land on any page: keep it for sign-up.
  useReferrals.getState().captureFromLocation();
  void useCatalog.getState().load();
  void useSession
    .getState()
    .restore()
    .then(() => {
      onSessionChanged(useSession.getState().me != null);
      useSession.subscribe((s, prev) => {
        if ((s.me == null) !== (prev.me == null)) onSessionChanged(s.me != null);
      });
    });
}
