import { DEFAULT_FILTERS, readFilters, usesExtraFilters } from './filters';

describe('shared filters', () => {
  it('reads what is stored, falling back to defaults for anything missing or wrong', () => {
    expect(readFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(readFilters({ gender: 'women', minAge: 25, maxAge: 20, countryCode: 'pk', verifiedOnly: 'yes' })).toEqual({ gender: 'women', minAge: 25, maxAge: 25, countryCode: null, verifiedOnly: false });
    expect(readFilters({ minAge: 10, maxAge: 120, countryCode: 'PK', verifiedOnly: true })).toMatchObject({ minAge: 18, maxAge: 99, countryCode: 'PK', verifiedOnly: true });
  });

  it('age and verified only are free; gender or a country are the extra filters', () => {
    expect(usesExtraFilters({ ...DEFAULT_FILTERS })).toBe(false);
    expect(usesExtraFilters({ ...DEFAULT_FILTERS, gender: 'men' })).toBe(true);
    expect(usesExtraFilters({ ...DEFAULT_FILTERS, countryCode: 'PK' })).toBe(true);
    expect(usesExtraFilters({ ...DEFAULT_FILTERS, verifiedOnly: true })).toBe(false);
  });
});
