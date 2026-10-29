import { ApiError } from "@/lib/api/errors";
import { browserStorage } from "@/lib/referrals";
import { captureVisit, clearVisit, readVisit } from "@/lib/site-visit";

import { useAffiliate } from "./affiliate";
import { useCalls } from "./calls";
import { useCatalog } from "./catalog";
import { useDiscover } from "./discover";
import { useEngagement } from "./engagement";
import { useFollows } from "./follows";
import { useInbox } from "./inbox";
import { useMatch } from "./match";
import { useMoments } from "./moments";
import { useReferrals } from "./referrals";
import { api, realtime } from "./services";
import { useSession } from "./session";
import { useSocial } from "./social";
import { useWallet } from "./wallet";
import { useWaitlist } from "./waitlist";
import { useWaves } from "./waves";
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
    useWaitlist.getState().load(),
    useDiscover.getState().loadStatus(),
  ]);
}

function onSessionChanged(signedIn: boolean) {
  if (signedIn && !live) {
    live = true;
    realtime.connect();
    void loadAll();
    void useSession.getState().loadVerification();
    void sendVisitAttribution();
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
    useWaitlist.getState().reset();
    useWaves.getState().reset();
    useDiscover.getState().reset();
    useCalls.getState().reset();
    stopBreakReminder();
  }
}

/** A new account that came from the marketing site: tell the server which visit (once). */
async function sendVisitAttribution() {
  const kv = browserStorage();
  const v = readVisit(kv);
  if (!v) return;
  try {
    await api.post("/site/attribution", { visitId: v.id });
    clearVisit(kv);
  } catch (e) {
    if (e instanceof ApiError) clearVisit(kv); // the server answered: don't retry
  }
}

export function startApp() {
  if (started) return;
  started = true;
  // An invite link (?ref=CODE&s=SOURCE) can land on any page: keep it for sign-up.
  useReferrals.getState().captureFromLocation();
  // A link from the marketing site (?vid=…): keep the visit for sign-up attribution.
  const cleaned = captureVisit(new URL(window.location.href), browserStorage());
  if (cleaned != null) window.history.replaceState(window.history.state, "", cleaned);
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
