import { getFinishRateBreakdown, getRankLabelForDivision, getStrikePlacement } from './eventsDesktopHelpers';

describe('getFinishRateBreakdown', () => {
  // Regression test for the real data bug found during the Events redesign
  // mockup: fighters.ufc_losses_dec was stale (read 0) for a fighter whose
  // actual UFC losses were all decisions. Deriving from fight_history
  // directly, as this function does, can't go stale the same way.
  const fightHistory = [
    { result: 'win', method: 'TKO' },
    { result: 'win', method: 'Submission' },
    { result: 'win', method: 'TKO' },
    { result: 'win', method: 'Decision - Unanimous' },
    { result: 'win', method: 'Decision - Unanimous' },
    { result: 'win', method: 'KO/TKO' },
    { result: 'loss', method: 'Decision - Unanimous' },
    { result: 'loss', method: 'Decision - Split' },
    { result: 'loss', method: 'Decision - Unanimous' },
  ];
  const fighter = { fight_history: fightHistory };

  test('"all" breaks down every fight', () => {
    const result = getFinishRateBreakdown(fighter, 'all');
    expect(result).toEqual({ ko: 33, sub: 11, dec: 56, total: 9 });
  });

  test('"wins" breaks down only wins', () => {
    const result = getFinishRateBreakdown(fighter, 'wins');
    expect(result).toEqual({ ko: 50, sub: 17, dec: 33, total: 6 });
  });

  test('"losses" breaks down only losses — all three are decisions', () => {
    const result = getFinishRateBreakdown(fighter, 'losses');
    expect(result).toEqual({ ko: 0, sub: 0, dec: 100, total: 3 });
  });

  test('returns all zeros when the fighter has no fight_history', () => {
    expect(getFinishRateBreakdown({}, 'all')).toEqual({ ko: 0, sub: 0, dec: 0, total: 0 });
  });

  test('returns all zeros when the requested type has no fights', () => {
    const noLosses = { fight_history: [{ result: 'win', method: 'TKO' }] };
    expect(getFinishRateBreakdown(noLosses, 'losses')).toEqual({ ko: 0, sub: 0, dec: 0, total: 0 });
  });
});

describe('getRankLabelForDivision', () => {
  test('returns a bare rank when the fighter\'s ranked division matches the fight\'s division', () => {
    const fighter = { rankings: [{ division: 'Featherweight', rank: '2' }] };
    expect(getRankLabelForDivision(fighter, 'Featherweight')).toEqual({ isChampion: false, label: '#2' });
  });

  test('appends the division abbreviation when it differs from the fight\'s division', () => {
    const fighter = { rankings: [{ division: 'Featherweight', rank: '2' }] };
    expect(getRankLabelForDivision(fighter, 'Lightweight')).toEqual({ isChampion: false, label: '#2 FW' });
  });

  test('marks a champion', () => {
    const fighter = { rankings: [{ division: 'Lightweight', rank: 'C' }] };
    expect(getRankLabelForDivision(fighter, 'Lightweight')).toEqual({ isChampion: true, label: 'C' });
  });

  test('ignores a pound-for-pound ranking and returns null when there is no divisional rank', () => {
    const fighter = { rankings: [{ division: "Men's Pound-for-Pound", rank: '5' }] };
    expect(getRankLabelForDivision(fighter, 'Lightweight')).toBeNull();
  });

  test('returns null when the fighter has no rankings', () => {
    expect(getRankLabelForDivision({ rankings: [] }, 'Lightweight')).toBeNull();
    expect(getRankLabelForDivision({}, 'Lightweight')).toBeNull();
  });
});

describe('getStrikePlacement', () => {
  test('parses "count (pct%)" strings for each requested key', () => {
    const fighter = {
      sig_strikes_by_target: { head: '565 (59%)', body: '246 (26%)', leg: '143 (15%)' }
    };
    const result = getStrikePlacement(fighter, 'sig_strikes_by_target', [
      { key: 'head', label: 'Head' },
      { key: 'body', label: 'Body' },
      { key: 'leg', label: 'Leg' },
    ]);
    expect(result).toEqual([
      { label: 'Head', count: 565, pct: 59 },
      { label: 'Body', count: 246, pct: 26 },
      { label: 'Leg', count: 143, pct: 15 },
    ]);
  });

  test('returns zeros for a missing field or missing key', () => {
    expect(getStrikePlacement({}, 'sig_strikes_by_target', [{ key: 'head', label: 'Head' }]))
      .toEqual([{ label: 'Head', count: 0, pct: 0 }]);

    const partial = { sig_strikes_by_position: { standing: '100 (80%)' } };
    expect(getStrikePlacement(partial, 'sig_strikes_by_position', [
      { key: 'standing', label: 'Standing' },
      { key: 'clinch', label: 'Clinch' },
    ])).toEqual([
      { label: 'Standing', count: 100, pct: 80 },
      { label: 'Clinch', count: 0, pct: 0 },
    ]);
  });
});
