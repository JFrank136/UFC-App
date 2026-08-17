import { getFightPriorityScore, selectHeadlineFight, getDateParts, computeCountdownParts, formatFightDate } from './upcomingFightsHelpers';

const makeFight = (overrides = {}) => ({
  id: 'fight-1',
  fighter1_favorites: [],
  fighter2_favorites: [],
  ...overrides,
});

describe('getFightPriorityScore', () => {
  test('returns 2 when either fighter is a favorite', () => {
    const fight = makeFight({ fighter1_favorites: [{ priority: 'favorite' }] });
    expect(getFightPriorityScore(fight)).toBe(2);
  });

  test('returns 1 when a fighter is interested but nobody is a favorite', () => {
    const fight = makeFight({ fighter2_favorites: [{ priority: 'interested' }] });
    expect(getFightPriorityScore(fight)).toBe(1);
  });

  test('returns 0 when neither fighter is followed', () => {
    expect(getFightPriorityScore(makeFight())).toBe(0);
  });

  test('returns 2 when both fighters have favorites and at least one is a favorite', () => {
    const fight = makeFight({
      fighter1_favorites: [{ priority: 'favorite' }],
      fighter2_favorites: [{ priority: 'interested' }],
    });
    expect(getFightPriorityScore(fight)).toBe(2);
  });
});

describe('selectHeadlineFight', () => {
  test('returns null for an empty list', () => {
    expect(selectHeadlineFight([])).toBeNull();
  });

  test('returns the only fight when there is exactly one, regardless of tier', () => {
    const fight = makeFight({ fighter1_favorites: [{ priority: 'interested' }] });
    expect(selectHeadlineFight([fight])).toBe(fight);
  });

  test('returns the top fight when it strictly outranks the next one', () => {
    const favoriteFight = makeFight({ id: 'main', fighter1_favorites: [{ priority: 'favorite' }] });
    const interestedFight = makeFight({ id: 'prelim', fighter1_favorites: [{ priority: 'interested' }] });
    expect(selectHeadlineFight([favoriteFight, interestedFight])).toBe(favoriteFight);
  });

  test('returns null when the top two fights are tied on tier', () => {
    const fightA = makeFight({ id: 'a', fighter1_favorites: [{ priority: 'interested' }] });
    const fightB = makeFight({ id: 'b', fighter2_favorites: [{ priority: 'interested' }] });
    expect(selectHeadlineFight([fightA, fightB])).toBeNull();
  });
});

describe('getDateParts', () => {
  test('extracts day, month, and weekday without a timezone shift', () => {
    expect(getDateParts('2026-08-15')).toEqual({ day: 15, month: 'AUG', weekday: 'Saturday' });
  });

  test('handles a different month correctly', () => {
    expect(getDateParts('2026-09-12')).toEqual({ day: 12, month: 'SEP', weekday: 'Saturday' });
  });
});

describe('computeCountdownParts', () => {
  test('splits a future diff into days/hours/minutes/seconds', () => {
    const now = 0;
    const target = 7 * 86400000 + 4 * 3600000 + 12 * 60000 + 33 * 1000;
    expect(computeCountdownParts(target, now)).toEqual({ days: 7, hours: 4, minutes: 12, seconds: 33, isPast: false });
  });

  test('marks the target as past once time has elapsed', () => {
    expect(computeCountdownParts(0, 5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true });
  });

  test('treats the exact target moment as past, not a negative countdown', () => {
    expect(computeCountdownParts(1000, 1000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true });
  });
});

describe('formatFightDate', () => {
  test('formats a YYYY-MM-DD date as abbreviated month + 2-digit year', () => {
    expect(formatFightDate('2025-06-14')).toBe("Jun '25");
  });

  test('returns null for a missing date', () => {
    expect(formatFightDate(null)).toBeNull();
    expect(formatFightDate(undefined)).toBeNull();
  });
});
