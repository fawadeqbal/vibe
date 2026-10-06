import { DEFAULT_GIFTS, DEFAULT_PACKS, DEFAULT_PLANS, DEFAULT_RULES, filterCost, gemsFor, gemsToUsdCents, GiftsSchema, PacksSchema, PlansSchema, RULE_FIELDS, RulesPatchSchema, RulesSchema } from './economy';

const gift = (id: string) => DEFAULT_GIFTS.find((g) => g.id === id)!;

describe('economy', () => {
  it('filter costs follow BUSINESS.md', () => {
    expect(filterCost({ gender: 'ANYONE' }, false, DEFAULT_RULES)).toBe(0);
    expect(filterCost({ gender: 'MEN' }, false, DEFAULT_RULES)).toBe(DEFAULT_RULES.genderFilterCost);
    expect(filterCost({ gender: 'WOMEN', countryCode: 'US' }, false, DEFAULT_RULES)).toBe(DEFAULT_RULES.genderFilterCost + DEFAULT_RULES.regionFilterCost);
    expect(filterCost({ gender: 'WOMEN', countryCode: 'US' }, true, DEFAULT_RULES)).toBe(0);
    expect(filterCost({ gender: 'MEN' }, false, { genderFilterCost: 25, regionFilterCost: 0 })).toBe(25);
  });

  it('gifts pay the receiver half as gems', () => {
    expect(gemsFor(gift('rose'), DEFAULT_RULES)).toBe(3); // 2.5 rounds half up, like the app
    expect(gemsFor(gift('coffee'), DEFAULT_RULES)).toBe(25);
    expect(gemsFor(gift('rocket'), DEFAULT_RULES)).toBe(500);
    expect(gemsFor(gift('rocket'), { giftGemShare: 0.7 })).toBe(700);
  });

  it('pack bonuses and gem value', () => {
    expect(packTotalCoinsOf('pro')).toBe(3300);
    expect(gemsToUsdCents(DEFAULT_RULES.cashoutMinGems, DEFAULT_RULES)).toBe(2500);
  });

  it('the defaults pass their own validation, and every rule has an editor field', () => {
    expect(RulesSchema.safeParse(DEFAULT_RULES).success).toBe(true);
    expect(PacksSchema.safeParse(DEFAULT_PACKS).success).toBe(true);
    expect(PlansSchema.safeParse(DEFAULT_PLANS).success).toBe(true);
    expect(GiftsSchema.safeParse(DEFAULT_GIFTS).success).toBe(true);
    expect(RULE_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(DEFAULT_RULES).sort());
  });

  it('rejects unsafe values', () => {
    expect(RulesPatchSchema.safeParse({ minAge: 16 }).success).toBe(false);
    expect(RulesPatchSchema.safeParse({ welcomeCoins: 2.5 }).success).toBe(false);
    expect(RulesPatchSchema.safeParse({ checkInRewards: [1, 2, 3] }).success).toBe(false);
    expect(RulesPatchSchema.safeParse({ giftGemShare: 1.5 }).success).toBe(false);
    expect(RulesPatchSchema.safeParse({ nope: 1 }).success).toBe(false);
    // Clock rules are whole minutes after midnight.
    expect(RulesPatchSchema.safeParse({ vibeHourStart: 1439 }).success).toBe(true);
    expect(RulesPatchSchema.safeParse({ vibeHourStart: 1440 }).success).toBe(false);
    expect(RulesPatchSchema.safeParse({ vibeHourStart: 600.5 }).success).toBe(false);
    expect(RulesPatchSchema.safeParse({ maxEngagementPushesPerDay: 21 }).success).toBe(false);
    expect(PacksSchema.safeParse([...DEFAULT_PACKS, { ...DEFAULT_PACKS[0] }]).success).toBe(false); // duplicate id
    expect(PacksSchema.safeParse([]).success).toBe(false);
    expect(PlansSchema.safeParse(DEFAULT_PLANS.map((p) => ({ ...p, highlighted: true }))).success).toBe(false);
    expect(GiftsSchema.safeParse([{ id: 'Bad Id', name: 'x', emoji: '✨', coins: 1 }]).success).toBe(false);
  });

  it('an empty pack tag is dropped', () => {
    const r = PacksSchema.parse([{ id: 'starter', name: 'Starter', coins: 100, usdCents: 99, bonusPercent: 0, tag: '' }]);
    expect(r[0]).not.toHaveProperty('tag');
  });

  it('follows have a daily cap staff can change', () => {
    expect(DEFAULT_RULES.maxFollowsPerDay).toBe(200);
    expect(RULE_FIELDS.find((f) => f.key === 'maxFollowsPerDay')).toMatchObject({ kind: 'count', min: 1, max: 10_000 });
    expect(RulesPatchSchema.safeParse({ maxFollowsPerDay: 0 }).success).toBe(false);
    expect(RulesPatchSchema.safeParse({ maxFollowsPerDay: 50 }).success).toBe(true);
  });
});

function packTotalCoinsOf(id: string): number {
  const p = DEFAULT_PACKS.find((x) => x.id === id)!;
  return p.coins + Math.round((p.coins * p.bonusPercent) / 100);
}
