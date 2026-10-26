/**
 * The new-user funnel: of the people who signed up in a window, how many
 * set up a profile, had a first call, came back the next day and paid.
 * Every step is counted against sign-ups (not "of the step before"), so a
 * step that doesn't need the previous one (paying without returning) still
 * reads correctly; the biggest drop is the largest fall between neighbours.
 */
export type FunnelStepKey = 'signedUp' | 'setUp' | 'firstCall' | 'cameBack' | 'paid';

export interface FunnelStep {
  key: FunnelStepKey;
  label: string;
  /** What the step counts, for the tooltip. */
  hint: string;
  count: number;
  /** Who could have done it yet: everyone, except "came back" needs their next day to be over. */
  eligible: number;
  /** count / eligible, 0–1. */
  rate: number;
}

/** One sign-up day's row (business day, YYYY-MM-DD). */
export interface FunnelCohortRow {
  day: string;
  signups: number;
  setUp: number;
  firstCall: number;
  /** Null until the day after has ended. */
  cameBack: number | null;
  paid: number;
}

export interface FunnelReport {
  generatedAt: string;
  days: number;
  steps: FunnelStep[];
  /** The step that loses the most people compared with the one before it. */
  biggestDrop: FunnelStepKey | null;
  extras: {
    /** Photo, bio and 3 interests. */
    profileComplete: number;
    verified: number;
    /** Median time from sign-up to first call, among those who had one. */
    medianMinutesToFirstCall: number | null;
    /** Had their first call within an hour of signing up. */
    firstCallWithinHour: number;
    /** First call ended in under 10 seconds. */
    firstCallQuickSkip: number;
  };
  cohorts: FunnelCohortRow[];
}

/** Raw per-day counts as the query returns them. */
export interface CohortCounts {
  day: string;
  signups: number;
  setUp: number;
  firstCall: number;
  cameBack: number;
  /** 1 when the day after this sign-up day has ended, else 0. */
  d1Ready: boolean;
  paid: number;
  complete: number;
  verified: number;
  withinHour: number;
  quickSkip: number;
}

const LABELS: Record<FunnelStepKey, [string, string]> = {
  signedUp: ['Signed up', 'Created an account in this window'],
  setUp: ['Set up profile', 'Finished name, age and the permissions step'],
  firstCall: ['Had a first call', 'Was matched with someone at least once'],
  cameBack: ['Came back next day', 'Opened the app on the day after signing up (only days that have ended)'],
  paid: ['Paid', 'Made at least one successful purchase'],
};

const rate = (n: number, of: number) => (of > 0 ? n / of : 0);

export function buildFunnel(rows: CohortCounts[], medianMinutes: number | null, days: number, now: Date): FunnelReport {
  const sum = (f: (r: CohortCounts) => number) => rows.reduce((a, r) => a + f(r), 0);
  const signups = sum((r) => r.signups);
  const d1Eligible = sum((r) => (r.d1Ready ? r.signups : 0));
  const counts: Record<FunnelStepKey, [number, number]> = {
    signedUp: [signups, signups],
    setUp: [sum((r) => r.setUp), signups],
    firstCall: [sum((r) => r.firstCall), signups],
    cameBack: [sum((r) => (r.d1Ready ? r.cameBack : 0)), d1Eligible],
    paid: [sum((r) => r.paid), signups],
  };
  const steps: FunnelStep[] = (Object.keys(LABELS) as FunnelStepKey[]).map((key) => ({
    key,
    label: LABELS[key][0],
    hint: LABELS[key][1],
    count: counts[key][0],
    eligible: counts[key][1],
    rate: rate(counts[key][0], counts[key][1]),
  }));

  let biggestDrop: FunnelStepKey | null = null;
  let worst = 0;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].eligible === 0) continue;
    const drop = steps[i - 1].rate - steps[i].rate;
    if (drop > worst) {
      worst = drop;
      biggestDrop = steps[i].key;
    }
  }

  return {
    generatedAt: now.toISOString(),
    days,
    steps,
    biggestDrop: signups ? biggestDrop : null,
    extras: {
      profileComplete: sum((r) => r.complete),
      verified: sum((r) => r.verified),
      medianMinutesToFirstCall: medianMinutes == null ? null : Math.round(medianMinutes),
      firstCallWithinHour: sum((r) => r.withinHour),
      firstCallQuickSkip: sum((r) => r.quickSkip),
    },
    cohorts: rows.map((r) => ({ day: r.day, signups: r.signups, setUp: r.setUp, firstCall: r.firstCall, cameBack: r.d1Ready ? r.cameBack : null, paid: r.paid })),
  };
}
