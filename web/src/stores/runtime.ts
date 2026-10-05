import { useCatalog } from "./catalog";
import { useFollows } from "./follows";
import { useInbox } from "./inbox";
import { useMatch } from "./match";
import { realtime } from "./services";
import { useSession } from "./session";
import { useSocial } from "./social";
import { useWallet } from "./wallet";

/**
 * App lifecycle (the Flutter `VibeApp` state): restore the session once,
 * open the socket and load everything on sign-in, close it and forget the
 * user's data on sign-out. Call `startApp()` once from the client.
 */
let started = false;
let live = false;

async function loadAll() {
  await useCatalog.getState().load();
  await Promise.allSettled([useWallet.getState().load(), useSocial.getState().load(), useFollows.getState().load(), useMatch.getState().load(), useInbox.getState().load()]);
}

function onSessionChanged(signedIn: boolean) {
  if (signedIn && !live) {
    live = true;
    realtime.connect();
    void loadAll();
    void useSession.getState().loadVerification();
  } else if (!signedIn && live) {
    live = false;
    realtime.disconnect();
    useMatch.getState().reset();
    useWallet.getState().reset();
    useSocial.getState().reset();
    useFollows.getState().reset();
    useInbox.getState().reset();
  }
}

export function startApp() {
  if (started) return;
  started = true;
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
