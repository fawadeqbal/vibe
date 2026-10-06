import { GAME_IDS, pickPrompt, PROMPTS } from './icebreakers';

describe('icebreakers', () => {
  it('has at least 40 distinct prompts per game; two-option games always have two options', () => {
    for (const g of GAME_IDS) {
      const list = PROMPTS[g];
      expect(list.length).toBeGreaterThanOrEqual(40);
      const keys = list.map((p) => `${p.text}|${p.options?.join('|') ?? ''}`);
      expect(new Set(keys).size).toBe(list.length);
      for (const p of list) expect(g === 'questions' ? p.options : p.options?.length).toBe(g === 'questions' ? undefined : 2);
    }
  });

  it('never repeats a prompt until all were shown', () => {
    const used: number[] = [];
    for (let i = 0; i < PROMPTS.wyr.length; i++) used.push(pickPrompt('wyr', used));
    expect(new Set(used).size).toBe(PROMPTS.wyr.length);
    expect(pickPrompt('wyr', used, () => 0)).toBe(0); // all used: starts over
  });
});
