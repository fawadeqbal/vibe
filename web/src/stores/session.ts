import { create } from "zustand";

import { ApiError } from "@/lib/api/errors";
import { tokenStore } from "@/lib/api/tokens";
import { asList, asMap, type Json, profile as mapProfile } from "@/lib/api/mappers";
import type { Profile } from "@/lib/models";
import {
  type IdentitiesView,
  NO_VERIFICATION,
  parseIdentities,
  parseVerification,
  type SocialCredential,
  type VerificationState,
} from "@/lib/payments";

import { api } from "./services";

/**
 * Who is signed in, and how far through first-run they are.
 *
 * Flow: splash (restore) → welcome → sign-in → profile setup → permissions
 * → home. `onboarded` flips only when the profile is complete enough to
 * match (name, age) and the permission step was passed. Mirror of the
 * Flutter `RemoteSessionProvider`.
 */
interface SessionState {
  me: Profile | null;
  booting: boolean;
  onboarded: boolean;
  busy: boolean;
  cameraGranted: boolean;
  micGranted: boolean;
  /** News and offers by e-mail. Sign-in codes arrive either way. */
  emailUpdates: boolean;
  inviteCode: string | null;
  verificationState: VerificationState;

  restore: () => Promise<void>;
  requestCode: (email: string) => Promise<void>;
  signInWithEmail: (email: string, code: string) => Promise<void>;
  signInWith: (credential: SocialCredential) => Promise<void>;
  socialProviders: () => Promise<string[]>;
  identities: () => Promise<IdentitiesView>;
  linkIdentity: (credential: SocialCredential) => Promise<IdentitiesView>;
  /** Rejects with ApiError 409 when it is the last way to sign in. */
  unlinkIdentity: (provider: string) => Promise<IdentitiesView>;
  uploadAvatar: (file: Blob) => Promise<void>;
  saveProfile: (p: Profile) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  verifySelfie: (jpeg: Blob) => Promise<VerificationState>;
  loadVerification: () => Promise<void>;
  /** False when the change could not be saved (the switch flips back). */
  setEmailUpdates: (on: boolean) => Promise<boolean>;
  refreshMe: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
  requestPermissions: () => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Runs before the session is dropped on sign-out (while the token still works). */
  addSignOutHook: (hook: () => Promise<void> | void) => void;
}

const signOutHooks: Array<() => Promise<void> | void> = [];
let cachedProviders: string[] | null = null;

export const useSession = create<SessionState>()((set, get) => {
  const applyMe = (m: Json) =>
    set({
      me: mapProfile(m),
      onboarded: m.onboarded === true,
      inviteCode: typeof m.inviteCode === "string" ? m.inviteCode : null,
      emailUpdates: m.marketingEmails !== false,
    });

  const busyWhile = async <T,>(fn: () => Promise<T>): Promise<T> => {
    set({ busy: true });
    try {
      return await fn();
    } finally {
      set({ busy: false });
    }
  };

  const signedIn = async (res: unknown) => {
    const r = asMap(res);
    api.setTokens(asMap(r.tokens) as { accessToken: string; refreshToken: string });
    applyMe(asMap(r.user));
    set({ verificationState: NO_VERIFICATION });
  };

  api.onSessionExpired = () => set({ me: null, onboarded: false });

  return {
    me: null,
    booting: true,
    onboarded: false,
    busy: false,
    cameraGranted: false,
    micGranted: false,
    emailUpdates: true,
    inviteCode: null,
    verificationState: NO_VERIFICATION,

    async restore() {
      try {
        api.restore();
        if (api.hasSession) {
          try {
            applyMe(asMap(await api.get("/me")));
          } catch (e) {
            if (e instanceof ApiError && e.isUnauthenticated) api.clearSession();
            // Offline at launch: stay signed out of the UI until we can reach the server.
          }
        }
        await get().refreshPermissions();
      } finally {
        set({ booting: false });
      }
    },

    requestCode: (email) => busyWhile(async () => void (await api.post("/auth/otp/request", { email: email.trim().toLowerCase() }))),

    signInWithEmail: (email, code) => busyWhile(async () => signedIn(await api.post("/auth/otp/verify", { email: email.trim().toLowerCase(), code }))),

    signInWith: (credential) => busyWhile(async () => signedIn(await api.post("/auth/social", credential))),

    async socialProviders() {
      try {
        const res = asMap(await api.get("/auth/providers"));
        cachedProviders = asList(res.providers).map((p) => String(p).toLowerCase());
        return cachedProviders;
      } catch {
        return cachedProviders ?? [];
      }
    },

    identities: async () => parseIdentities(asMap(await api.get("/me/identities"))),

    async linkIdentity(c) {
      const { name: _ignored, ...body } = c;
      void _ignored;
      return parseIdentities(asMap(await api.post("/me/identities", body)));
    },

    unlinkIdentity: async (provider) => parseIdentities(asMap(await api.delete(`/me/identities/${provider}`))),

    async uploadAvatar(file) {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      applyMe(asMap(await api.upload("/me/avatar", "file", file, `avatar.${ext}`)));
    },

    async saveProfile(p) {
      const res = await api.patch("/me", {
        name: p.name,
        age: p.age,
        gender: p.gender,
        countryCode: p.country.code,
        bio: p.bio,
        interests: p.interests,
        ...(p.avatarUrl ? { avatarUrl: p.avatarUrl } : {}),
      });
      applyMe(asMap(res));
    },

    async finishOnboarding() {
      applyMe(asMap(await api.post("/me/onboarding/complete")));
    },

    verifySelfie: (jpeg) =>
      busyWhile(async () => {
        try {
          const res = asMap(await api.upload("/me/verification", "selfie", jpeg, "selfie.jpg"));
          applyMe(res);
          set({ verificationState: parseVerification(asMap(res.verification)) });
        } catch (e) {
          // A rejected selfie comes back as a 400 with the reason to show.
          if (!(e instanceof ApiError) || e.code !== "VALIDATION_FAILED") throw e;
          set({ verificationState: { status: "rejected", reason: e.message } });
        }
        return verification(get());
      }),

    async loadVerification() {
      if (!api.hasSession) return;
      try {
        set({ verificationState: parseVerification(asMap(await api.get("/me/verification"))) });
      } catch {}
    },

    async setEmailUpdates(on) {
      const before = get().emailUpdates;
      set({ emailUpdates: on });
      try {
        applyMe(asMap(await api.patch("/me", { marketingEmails: on })));
        return true;
      } catch {
        set({ emailUpdates: before });
        return false;
      }
    },

    async refreshMe() {
      if (!api.hasSession) return;
      try {
        applyMe(asMap(await api.get("/me")));
      } catch {}
    },

    async refreshPermissions() {
      const query = async (name: string) => {
        try {
          const s = await navigator.permissions.query({ name: name as PermissionName });
          return s.state === "granted";
        } catch {
          return false; // the Permissions API can't tell: ask on the permissions step
        }
      };
      const [cam, mic] = await Promise.all([query("camera"), query("microphone")]);
      set({ cameraGranted: cam, micGranted: mic });
    },

    async requestPermissions() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach((t) => t.stop());
        set({ cameraGranted: true, micGranted: true });
        return true;
      } catch {
        await get().refreshPermissions();
        return false;
      }
    },

    async signOut() {
      for (const h of signOutHooks) {
        try {
          await h();
        } catch {}
      }
      const t = api.hasSession ? tokenStore.read() : null;
      if (t) {
        try {
          await api.post("/auth/logout", { refreshToken: t.refresh });
        } catch {}
      }
      api.clearSession();
      set({ me: null, onboarded: false, verificationState: NO_VERIFICATION });
    },

    addSignOutHook: (hook) => void signOutHooks.push(hook),
  };
});

/** The latest selfie check; a verified profile always reads as approved. */
export const verification = (s: Pick<SessionState, "me" | "verificationState">): VerificationState =>
  s.me?.verified ? { status: "approved", reason: null } : s.verificationState;

/** True once the profile has what the matcher needs. */
export const profileReady = (me: Profile | null) => !!me && me.name.trim().length > 0 && me.age >= 18;

