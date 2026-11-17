import { worldRegion } from './world-regions';

describe('worldRegion', () => {
  it('puts countries in one of eight regions', () => {
    expect(worldRegion('PK')).toBe('South Asia');
    expect(worldRegion('ae')).toBe('Middle East');
    expect(worldRegion('EG')).toBe('Africa');
    expect(worldRegion('GB')).toBe('Europe');
    expect(worldRegion('MX')).toBe('North America');
    expect(worldRegion('PH')).toBe('East Asia & Pacific');
    expect(worldRegion('BR')).toBe('South America');
    expect(worldRegion('NZ')).toBe('Oceania');
  });

  it('is Unknown without a real code', () => {
    expect(worldRegion(null)).toBe('Unknown');
    expect(worldRegion('XX')).toBe('Unknown');
    expect(worldRegion('T1')).toBe('Unknown');
  });

  it('knows every country Intl knows, each in exactly one region', () => {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    const missing: string[] = [];
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = names.of(code);
        // Current countries/territories only: Intl echoes unknown codes back, and also names old codes (SU, YU…) and pseudo-locales.
        if (
          name &&
          name !== code &&
          !/^(AC|CP|DG|EA|EU|EZ|IC|QO|TA|UN|ZZ|AQ|BV|HM|GS|IO|TF|UM|CX|CC|AN|BU|CQ|CS|DD|DY|FX|HV|NH|RH|SU|TP|UK|VD|XA|XB|YD|YU|ZR)$/.test(
            code,
          ) &&
          worldRegion(code) === 'Unknown'
        )
          missing.push(`${code} ${name}`);
      }
    expect(missing).toEqual([]);
  });
});
