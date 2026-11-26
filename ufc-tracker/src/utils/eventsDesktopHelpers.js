// src/utils/eventsDesktopHelpers.js
// Desktop-only Events page logic. Kept separate from eventHelpers.js because
// these functions are new for the desktop redesign and have no mobile caller.

const METHOD_PATTERNS = {
  ko: /ko|tko|knockout/,
  sub: /sub|submission|tap/,
  dec: /decision|unanimous|majority|split/,
};

/**
 * KO-TKO/Submission/Decision percentage breakdown for a fighter, computed
 * directly from fight_history rather than the fighters table's
 * ufc_wins_ko/sub/dec / ufc_losses_ko/sub/dec columns — those columns were
 * found to be stale for at least one fighter during the Events redesign
 * mockup (see the design spec's "Data notes" section), so deriving from the
 * actual fight-by-fight history avoids trusting them.
 *
 * type: 'all' | 'wins' | 'losses'
 */
export const getFinishRateBreakdown = (fighter, type = 'all') => {
  const history = fighter?.fight_history || [];
  let fights = history;
  if (type === 'wins') fights = history.filter((f) => f.result?.toLowerCase() === 'win');
  else if (type === 'losses') fights = history.filter((f) => f.result?.toLowerCase() === 'loss');

  const total = fights.length;
  if (total === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };

  const countByMethod = (pattern) =>
    fights.filter((f) => f.method?.toLowerCase().match(pattern)).length;

  return {
    ko: Math.round((countByMethod(METHOD_PATTERNS.ko) / total) * 100),
    sub: Math.round((countByMethod(METHOD_PATTERNS.sub) / total) * 100),
    dec: Math.round((countByMethod(METHOD_PATTERNS.dec) / total) * 100),
    total,
  };
};

const DIVISION_ABBREVIATIONS = {
  'Flyweight': 'FLW',
  'Bantamweight': 'BW',
  'Featherweight': 'FW',
  'Lightweight': 'LW',
  'Welterweight': 'WW',
  'Middleweight': 'MW',
  'Light Heavyweight': 'LHW',
  'Heavyweight': 'HW',
  "Women's Strawweight": 'WSW',
  "Women's Flyweight": 'WFLW',
  "Women's Bantamweight": 'WBW',
  "Women's Featherweight": 'WFW',
};

/**
 * Rank label for a fighter within the context of one specific fight's
 * division. Returns a bare "#N" (or "C" for champion) when the fighter's
 * ranked division matches the fight's division, otherwise appends the
 * division abbreviation (e.g. "#2 FW") so a fighter's rank in some other
 * division isn't shown as if it applied to this fight. Returns null when
 * the fighter has no divisional ranking (a pound-for-pound-only ranking
 * does not count).
 */
export const getRankLabelForDivision = (fighter, fightDivision) => {
  const divisional = (fighter?.rankings || []).find(
    (r) => !r.division?.toLowerCase().includes('pound-for-pound')
  );
  if (!divisional) return null;

  const isChampion = divisional.rank === 'C';
  const rankText = isChampion ? 'C' : `#${divisional.rank}`;
  const sameDivision = fightDivision && divisional.division === fightDivision;
  const abbr = DIVISION_ABBREVIATIONS[divisional.division];

  return {
    isChampion,
    label: sameDivision || !abbr ? rankText : `${rankText} ${abbr}`,
  };
};

/**
 * Parses a fighters.sig_strikes_by_position / sig_strikes_by_target value
 * (e.g. { head: "565 (59%)", body: "246 (26%)", leg: "143 (15%)" }) into an
 * ordered array of { label, count, pct } for the requested keys. Missing
 * field or missing key both come back as { count: 0, pct: 0 } rather than
 * throwing, since this data is sparser than the rest of the fighters row.
 */
export const getStrikePlacement = (fighter, field, labels) => {
  const raw = fighter?.[field] || {};
  return labels.map(({ key, label }) => {
    const value = raw[key];
    const match = value ? String(value).match(/(\d+)\s*\((\d+)%\)/) : null;
    return {
      label,
      count: match ? parseInt(match[1], 10) : 0,
      pct: match ? parseInt(match[2], 10) : 0,
    };
  });
};

export const POSITION_LABELS = [
  { key: 'standing', label: 'Standing' },
  { key: 'clinch', label: 'Clinch' },
  { key: 'ground', label: 'Ground' },
];

export const TARGET_LABELS = [
  { key: 'head', label: 'Head' },
  { key: 'body', label: 'Body' },
  { key: 'leg', label: 'Leg' },
];
