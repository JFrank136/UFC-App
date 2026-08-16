import { getCountryCode } from './countryCodes';

describe('getCountryCode', () => {
  test('derives the 2-letter code from the stored flag emoji', () => {
    expect(getCountryCode('Ireland')).toBe('IE');
    expect(getCountryCode('Russia')).toBe('RU');
    expect(getCountryCode('United States')).toBe('US');
  });

  test('returns null for a country not in the map', () => {
    expect(getCountryCode('Atlantis')).toBeNull();
  });

  test('returns null for a missing/undefined country', () => {
    expect(getCountryCode(undefined)).toBeNull();
  });
});
