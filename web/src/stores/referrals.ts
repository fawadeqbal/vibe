import { create } from "zustand";

import { ApiError } from "@/lib/api/errors";
import { asMap, int, str } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import {
  browserStorage,
  captureRef,
  type CapturedRef,
  claimErrorMessage,
  clearRef,
  type MilestoneReward,
  milestoneReward,
  readRef,
  type ReferralOverview,
  referralOverview,
  referralPerson,
  referralStatus,
  type ReferralStatus,
  upsertPerson,
} from "@/lib/referrals";

import { api, realtime } from "./services";
import { useSession } from "./session";
import { toast } from "./ui";

/** Who invited you, from the public preview (before sign-up). */
export interface InvitePreview {
  code: string;
  valid: boolean;
  kind: "user" | "affiliate" | null;
  name: string | null;
  avatarUrl: string | null;
  inviteeCoins: number;
}

export interface MilestoneHit {
  index: number;
  count: number;
  reward: MilestoneReward;
}

export interface ClaimResult {
  status: ReferralStatus;
  inviterName: string;
  inviteeCoins: number;
}

/**
 * Invite friends: the code captured from a `?ref=` link (kept 30 days until
 * sign-up), `GET /referrals`, the late "Have an invite code?" claim, and the
 * live `referral:updated` / `referral:milestone` events (the host celebrates
 * milestones).
 */
interface ReferralsState {
  captured: CapturedRef | null;
  preview: InvitePreview | null;
  overview: ReferralOverview | null;
  loading: boolean;
  error: string | null;
  milestone: MilestoneHit | null;

  /** Reads `?ref=` / `?s=` from the address bar (any page), stores it and strips it. */
  captureFromLocation: () => void;
  load: () => Promise<void>;
  /** Rejects with a friendly message (`Error`) for the known error codes. */
  claim: (code: string) => Promise<ClaimResult>;
  clearMilestone: () => void;
  reset: () => void;
}

let previewFor: string | null = null;

export const useReferrals = create<ReferralsState>()((set, get) => ({
  captured: null,
  preview: null,
  overview: null,
  loading: false,
  error: null,
  milestone: null,

  captureFromLocation() {
    if (typeof window === "undefined") return;
    const kv = browserStorage();
    const { cleaned } = captureRef(new URL(window.location.href), kv);
    // Next's router keeps working with replaceState (it syncs usePathname/useSearchParams).
    if (cleaned != null) window.history.replaceState(window.history.state, "", cleaned);
    const captured = readRef(kv);
    set({ captured });
    if (captured && previewFor !== captured.code) void loadPreview(captured);
  },

  async load() {
    if (!api.hasSession) return;
    set({ loading: !get().overview, error: null });
    try {
      set({ overview: referralOverview(asMap(await api.get("/referrals"))), loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof ApiError ? e.message : "Couldn't load your invites." });
    }
  },

  async claim(raw) {
    try {
      const r = asMap(await api.post("/referrals/claim", { code: raw.trim() }));
      clearRef(browserStorage());
      set({ captured: null });
      await useSession.getState().refreshMe();
      return { status: referralStatus(r.status), inviterName: str(asMap(r.inviter).name), inviteeCoins: int(r.inviteeCoins) };
    } catch (e) {
      if (e instanceof ApiError) throw new Error(claimErrorMessage(e.code, e.message));
      throw e;
    }
  },

  clearMilestone: () => set({ milestone: null }),

  reset: () => set({ overview: null, loading: false, error: null, milestone: null }),
}));

async function loadPreview(ref: CapturedRef) {
  previewFor = ref.code;
  try {
    const p = asMap(await api.get(`/referrals/preview/${encodeURIComponent(ref.code)}`, ref.source ? { s: ref.source } : undefined));
    const kind = p.kind === "user" || p.kind === "affiliate" ? p.kind : null;
    useReferrals.setState({
      preview: { code: ref.code, valid: p.valid === true, kind, name: typeof p.name === "string" ? p.name : null, avatarUrl: typeof p.avatarUrl === "string" ? p.avatarUrl : null, inviteeCoins: int(p.inviteeCoins) },
    });
  } catch {
    previewFor = null;
  }
}

// Signed in: the captured invite was sent (or doesn't apply) — re-read what is left.
useSession.subscribe((s, prev) => {
  if ((s.me == null) !== (prev.me == null)) useReferrals.setState({ captured: readRef(browserStorage()) });
});

let reloadTimer: ReturnType<typeof setTimeout> | undefined;

realtime.on(Ev.referralUpdated, (d) => {
  const person = referralPerson(asMap(d.referral));
  const ov = useReferrals.getState().overview;
  if (ov) useReferrals.setState({ overview: { ...ov, people: upsertPerson(ov.people, person) } });
  const name = person.profile.name.split(" ")[0] || "Your friend";
  if (d.event === "joined") toast(`${name} joined Vibe with your invite 🎉`);
  else if (d.event === "rewarded") toast(`+${int(d.coins)} coins — ${name} is now active`);
  // Totals and milestones come from the server.
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void useReferrals.getState().load(), 400);
});

realtime.on(Ev.referralMilestone, (d) => {
  useReferrals.setState({ milestone: { index: int(d.index), count: int(d.count), reward: milestoneReward(asMap(d.reward)) } });
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void useReferrals.getState().load(), 400);
});
