# Events Page Redesign (Desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the desktop (≥860px) list+detail Events page described in `docs/superpowers/specs/2026-11-26-events-redesign-design.md`, replacing the old inline-expand `BettingCard` stat carousel with a single comparison block (including a working All/Wins/Losses finish-rate toggle) plus a new per-fight "Fight breakdown" drill-in using strike-placement data that exists in Supabase but is never rendered today.

**Architecture:** `Events.js` picks desktop vs. mobile at the existing `min-width: 860px` breakpoint (same hook already used by `UpcomingFights.js`). The mobile branch keeps today's `EventCard`/`FightCard`/`BettingCard` components completely unchanged. The desktop branch is four new presentational components in `src/components/Events/` plus one new pure-logic utility module, wired together with plain `useState` in `Events.js` — no new hooks, matching how `UpcomingFights.js` already manages its own desktop/mobile state.

**Tech Stack:** React (CRA), Supabase, CSS Modules, React Router v6, lucide-react, Jest (for the new pure utility functions — this codebase does not write RTL tests for presentational components; see `upcomingFightsHelpers.test.js` / `eventHelpers.test.js` / `countryCodes.test.js` for the existing pattern this plan follows).

---

## File Structure

**Modify:**
- `ufc-tracker/src/api/supabaseQueries.js` — `getEventData` additionally fetches `user_favorites` and attaches `fighter1_favorites`/`fighter2_favorites` to each fight (same shape `getFullUpcomingFights` already produces), so the comparison card can show the inline favorite star.
- `ufc-tracker/src/pages/Events.js` — add the desktop branch (`useMediaQuery`, selection state) alongside the existing unchanged mobile JSX.
- `ufc-tracker/src/styles/Events.module.css` — append a new desktop CSS block (new class names, does not touch any existing mobile class).

**Create:**
- `ufc-tracker/src/utils/eventsDesktopHelpers.js` — pure functions: `getFinishRateBreakdown`, `getRankLabelForDivision`, `getStrikePlacement`.
- `ufc-tracker/src/utils/eventsDesktopHelpers.test.js`
- `ufc-tracker/src/components/Events/EventListSidebar.js` — left sidebar: event list, date chips, row click → select event.
- `ufc-tracker/src/components/Events/EventDetailPane.js` — right pane shell: event header, Main Card/Prelims/Early Prelims segmented control, fight rows, holds which fight/view (comparison vs. breakdown) is active.
- `ufc-tracker/src/components/Events/FightComparisonCard.js` — the stacked two-fighter comparison block (bio, striking, grappling, finish-rate + toggle, last-3, "Full fight breakdown" link).
- `ufc-tracker/src/components/Events/FightBreakdownPanel.js` — strike-placement (position + target silhouette) and last-5 fights, shown in place of the comparison card when "Full fight breakdown" is clicked.

**Untouched (mobile, out of scope per spec):** `EventCard.js`, `FightCard.js`, `BettingCard.js`, `EventCard.module.css`, `FightCard.module.css`, `BettingCard.module.css`.

---

### Task 1: Fetch favorites in `getEventData`

**Files:**
- Modify: `ufc-tracker/src/api/supabaseQueries.js:5-74`

- [ ] **Step 1: Add the `user_favorites` fetch and attach it per fighter**

Replace the whole `getEventData` function (lines 5–74) with:

```js
// Events.js - Everything but user_favorites
export const getEventData = async () => {
  // Only fetch events from 3 days ago onward to keep fighter count manageable
  // (fetching all upcoming fights leads to 400+ fighters, hitting Supabase's 1000-row limit on fight_history)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: fights, error } = await supabase
    .from('upcoming_fights')
    .select('*')
    .gte('event_date', cutoffStr)
    .order('event_date');

  if (error) throw error;
  if (!fights || fights.length === 0) return [];

  // Get all unique fighter IDs
  const fighterIds = [...new Set([
    ...fights.map(f => f.fighter1_id),
    ...fights.map(f => f.fighter2_id)
  ].filter(Boolean))];

  // Get fighters data
  const { data: fighters, error: fightersError } = await supabase
    .from('fighters')
    .select('*')
    .in('id', fighterIds);

  if (fightersError) throw fightersError;

  // Paginate fight_history to bypass Supabase's 1000-row default limit
  let fightHistory = [];
  let rangeStart = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: batch, error: batchError } = await supabase
      .from('fight_history')
      .select('*')
      .in('fighter_id', fighterIds)
      .range(rangeStart, rangeStart + PAGE_SIZE - 1);
    if (batchError) throw batchError;
    if (!batch || batch.length === 0) break;
    fightHistory = fightHistory.concat(batch);
    if (batch.length < PAGE_SIZE) break;
    rangeStart += PAGE_SIZE;
  }

  const { data: rankings, error: rankingsError } = await supabase
    .from('rankings')
    .select('*')
    .in('uuid', fighterIds);

  if (rankingsError) throw rankingsError;

  const { data: userFavorites, error: favoritesError } = await supabase
    .from('user_favorites')
    .select('*')
    .in('fighter_id', fighterIds);

  if (favoritesError) throw favoritesError;

  // Combine data
  const fightersMap = {};
  fighters?.forEach(fighter => {
    fightersMap[fighter.id] = {
      ...fighter,
      fight_history: fightHistory?.filter(h => h.fighter_id === fighter.id) || [],
      rankings: rankings?.filter(r => r.uuid === fighter.id) || []
    };
  });

  return fights.map(fight => ({
    ...fight,
    fighter1_data: fightersMap[fight.fighter1_id] || null,
    fighter2_data: fightersMap[fight.fighter2_id] || null,
    fighter1_favorites: userFavorites?.filter(f => f.fighter_id === fight.fighter1_id) || [],
    fighter2_favorites: userFavorites?.filter(f => f.fighter_id === fight.fighter2_id) || []
  }));
};
```

- [ ] **Step 2: Manually verify in the running app**

This function has no existing unit test (it calls Supabase directly, like every other function in this file — none of them are mocked/unit tested in this codebase). Verify instead by running the app:

```bash
cd ufc-tracker
npm start
```

Open `/events`, open the browser console, and run:

```js
import('/src/api/supabaseQueries.js').then(m => m.getEventData().then(d => console.log(d[0])))
```

(Or simpler: add a temporary `console.log(fights[0])` in `useEventData.js` after `setFights(eventData)`, reload, confirm the logged fight object now has non-undefined `fighter1_favorites`/`fighter2_favorites` arrays, then remove the `console.log`.)

- [ ] **Step 3: Commit**

```bash
git add ufc-tracker/src/api/supabaseQueries.js
git commit -m "feat(events): fetch user_favorites in getEventData"
```

---

### Task 2: `eventsDesktopHelpers.js` — pure logic, TDD

**Files:**
- Create: `ufc-tracker/src/utils/eventsDesktopHelpers.js`
- Test: `ufc-tracker/src/utils/eventsDesktopHelpers.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ufc-tracker/src/utils/eventsDesktopHelpers.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
cd ufc-tracker
npx react-scripts test src/utils/eventsDesktopHelpers.test.js --watchAll=false
```

Expected: FAIL — `Cannot find module './eventsDesktopHelpers'`.

- [ ] **Step 3: Write the implementation**

Create `ufc-tracker/src/utils/eventsDesktopHelpers.js`:

```js
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
```

- [ ] **Step 4: Run the tests and verify they pass**

```bash
cd ufc-tracker
npx react-scripts test src/utils/eventsDesktopHelpers.test.js --watchAll=false
```

Expected: PASS — all 13 tests green.

- [ ] **Step 5: Commit**

```bash
git add ufc-tracker/src/utils/eventsDesktopHelpers.js ufc-tracker/src/utils/eventsDesktopHelpers.test.js
git commit -m "feat(events): add desktop finish-rate/rank/strike-placement helpers"
```

---

### Task 3: Desktop CSS tokens and layout classes

**Files:**
- Modify: `ufc-tracker/src/styles/Events.module.css` (append to end of file)

- [ ] **Step 1: Append the desktop block**

Add this to the end of `ufc-tracker/src/styles/Events.module.css`. It introduces its own token set scoped to `.desktopWrap` so it never touches the existing (mobile) `.eventsContainer[data-theme]` rules above it:

```css
/* =====================================================
   Desktop (>= 860px) — list + detail
   Separate token scope from the mobile rules above so this
   addition can't regress the existing mobile styling.
   ===================================================== */

.desktopWrap {
  display: flex;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.desktopWrap[data-theme="dark"] {
  --bg: #05070c;
  --card: #151d31;
  --text: #f5f7fa;
  --mute: #7b8698;
  --gold: #facc15;
  --personal: #7fa3e0;
  --portrait: #212c47;
  --line: #262f47;
  background: var(--bg);
  color: var(--text);
}

.desktopWrap[data-theme="light"] {
  --bg: #dde3ed;
  --card: #ffffff;
  --text: #1e293b;
  --mute: #64748b;
  --gold: #a16207;
  --personal: #2563eb;
  --portrait: #e2e8f0;
  --line: #e7eaef;
  background: var(--bg);
  color: var(--text);
}

.desktopSidebar {
  width: 420px;
  flex: 0 0 auto;
  border-right: 1px solid var(--line);
  overflow-y: auto;
  padding: 1.5rem 0 2rem;
}

.desktopSidebarHead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1.5rem 1rem;
}

.desktopSidebarTitle {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.75rem;
  letter-spacing: 0.5px;
}

.desktopSidebarCount {
  font-size: 0.8rem;
  color: var(--mute);
  padding: 0 1.5rem 1rem;
}

.desktopEventRow {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  background: var(--card);
  border: none;
  border-radius: 10px;
  padding: 0.7rem 0.85rem;
  margin: 0 1rem 0.5rem;
  width: calc(100% - 2rem);
  cursor: pointer;
  text-align: left;
  color: var(--text);
  font-family: inherit;
}

.desktopEventRowSelected {
  outline: 1px solid var(--gold);
}

.desktopEventRow .dateChip {
  flex: 0 0 auto;
  width: 44px;
  text-align: center;
}

.desktopEventRow .dateChipDay {
  display: block;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.3rem;
  line-height: 1;
}

.desktopEventRow .dateChipMonth {
  display: block;
  font-size: 0.6rem;
  color: var(--mute);
  text-transform: uppercase;
}

.desktopEventRowInfo {
  flex: 1;
  min-width: 0;
}

.desktopEventRowName {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desktopEventRowMeta {
  font-size: 0.72rem;
  color: var(--mute);
  margin-top: 2px;
}

.desktopPpvTag {
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  color: var(--gold);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
}

.desktopDetail {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 1.75rem 2rem 3rem;
}

.desktopDetailEmpty {
  color: var(--mute);
  font-size: 0.9rem;
  padding-top: 2rem;
  text-align: center;
}

.desktopEventHeader h2 {
  font-size: 1.5rem;
  margin: 0 0 0.4rem;
}

.desktopEventMeta {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: var(--mute);
  margin-bottom: 1.25rem;
}

.desktopEventMeta span {
  display: flex;
  align-items: center;
  gap: 5px;
}

.desktopSegmented {
  display: flex;
  gap: 6px;
  margin-bottom: 1.25rem;
}

.desktopSegPill {
  flex: 1;
  text-align: center;
  font-size: 0.78rem;
  padding: 0.5rem 0;
  border-radius: 8px;
  border: none;
  background: var(--card);
  color: var(--mute);
  cursor: pointer;
  font-family: inherit;
}

.desktopSegPillActive {
  background: var(--gold);
  color: #05070c;
  font-weight: 600;
}

.desktopFightRow {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: var(--card);
  border: none;
  border-radius: 10px;
  padding: 0.6rem 0.85rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  text-align: left;
  color: var(--text);
  font-family: inherit;
}

.desktopFightRowSelected {
  outline: 1px solid var(--gold);
}

.desktopFightRowTag {
  font-size: 0.65rem;
  color: var(--mute);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.desktopFightRowAvatar {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--portrait);
  flex: 0 0 auto;
}

.desktopFightRowName {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
}

.desktopFightRowChevron {
  color: var(--mute);
  flex: 0 0 auto;
}

/* Comparison card */
.cmpCard {
  background: var(--card);
  border-radius: 14px;
  padding: 1.25rem 1.5rem 1.5rem;
  margin-bottom: 1.25rem;
}

.cmpGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 0.75rem;
}

.cmpSide {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  min-width: 0;
}

.cmpPortrait {
  width: 100%;
  max-width: 150px;
  aspect-ratio: 3 / 4;
  border-radius: 10px 10px 4px 4px;
  background: var(--portrait);
  object-fit: cover;
}

.cmpName {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
}

.cmpName svg { flex: 0 0 auto; }

.cmpFavoriteStar { color: var(--personal); }
.cmpChampionCrown { color: var(--gold); }

.cmpNick {
  font-size: 0.72rem;
  color: var(--mute);
  font-style: italic;
  min-height: 14px;
}

.cmpRec {
  font-size: 0.78rem;
  color: var(--mute);
  display: flex;
  align-items: center;
  gap: 5px;
}

.cmpFlag {
  width: 16px;
  height: 11px;
  border-radius: 2px;
  object-fit: cover;
}

.cmpRank {
  font-size: 0.72rem;
  color: var(--gold);
  font-weight: 600;
}

.cmpVs {
  grid-column: 1 / -1;
  text-align: center;
  font-size: 0.7rem;
  color: var(--mute);
  letter-spacing: 0.1em;
  padding: 2px 0;
}

.cmpSection {
  grid-column: 1 / -1;
  font-size: 0.65rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--gold);
  border-top: 1px solid var(--line);
  padding-top: 0.6rem;
  margin-top: 2px;
  text-align: center;
}

.cmpStatRow {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr minmax(92px, 1.2fr) 1fr;
  align-items: center;
  gap: 6px;
  padding: 0.35rem 0;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.cmpStatRow .cmpStatValue { text-align: right; }
.cmpStatRow .cmpStatValueRight { text-align: left; }

.cmpStatLabel {
  font-size: 0.62rem;
  color: var(--mute);
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  line-height: 1.25;
}

.cmpFinishHead {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  border-top: 1px solid var(--line);
  padding-top: 0.6rem;
  margin-top: 2px;
}

.cmpFinishHead .cmpSection { border-top: none; padding-top: 0; margin-top: 0; }

.cmpSegMiniGroup {
  display: flex;
  gap: 3px;
  background: var(--bg);
  border-radius: 7px;
  padding: 2px;
}

.cmpSegMini {
  font-size: 0.65rem;
  padding: 4px 8px;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--mute);
  cursor: pointer;
  font-family: inherit;
}

.cmpSegMiniActive {
  background: var(--card);
  color: var(--text);
  font-weight: 600;
}

.cmpRfCol {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.cmpRfItem {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.72rem;
  line-height: 1.3;
}

.cmpRfChip {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-size: 0.56rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #05070c;
  flex: 0 0 auto;
  margin-top: 1px;
}

.cmpRfChipWin { background: #4ade80; }
.cmpRfChipLoss { background: #f87171; }
.cmpRfOpp { font-weight: 600; }
.cmpRfMeta { color: var(--mute); }

.cmpBreakdownLink {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 0.5rem;
  padding: 0.55rem 0;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: none;
  color: var(--gold);
  font-size: 0.72rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

/* Fight breakdown panel */
.breakdownBack {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--mute);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0 0 1rem;
  font-family: inherit;
}

.placementWrap {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 10px;
}

.placementCol {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.placementItemTop {
  display: flex;
  justify-content: space-between;
  color: var(--mute);
  font-size: 0.72rem;
  margin-bottom: 3px;
}

.placementItemTop b { color: var(--text); font-weight: 600; }

.placementBar {
  height: 6px;
  background: var(--line);
  border-radius: 3px;
  overflow: hidden;
}

.placementBarFill { height: 100%; background: var(--gold); }
.placementBarFillAlt { height: 100%; background: var(--personal); }

.silhouetteCol {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.silhouetteCol svg { width: 56px; height: 130px; }
.silBase { fill: var(--portrait); }
.silFillGold { fill: var(--gold); }
.silFillPersonal { fill: var(--personal); }

.targetList { width: 100%; }

.targetRow {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 0;
  font-size: 0.68rem;
}

.targetRegion {
  flex: 0 0 auto;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 0.6rem;
}

.targetLeader {
  flex: 1;
  border-bottom: 1px dotted var(--line);
  margin-bottom: 3px;
}

.targetCount { color: var(--mute); flex: 0 0 auto; }
.targetPct {
  font-weight: 700;
  min-width: 28px;
  text-align: right;
  flex: 0 0 auto;
}
```

- [ ] **Step 2: Commit**

```bash
git add ufc-tracker/src/styles/Events.module.css
git commit -m "feat(events): add desktop list+detail CSS tokens and layout classes"
```

---

### Task 4: `EventListSidebar.js`

**Files:**
- Create: `ufc-tracker/src/components/Events/EventListSidebar.js`

- [ ] **Step 1: Write the component**

```jsx
import React from 'react';
import styles from '../../styles/Events.module.css';
import { formatDate, isPPV } from '../../utils/eventHelpers';

const getDateParts = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  return {
    day: date.getDate(),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
};

const EventListSidebar = ({ sortedEvents, selectedEventKey, onSelectEvent }) => {
  return (
    <div className={styles.desktopSidebar}>
      <div className={styles.desktopSidebarHead}>
        <div className={styles.desktopSidebarTitle}>Events</div>
      </div>
      <div className={styles.desktopSidebarCount}>{sortedEvents.length} events</div>

      {sortedEvents.map(([eventKey, eventData]) => {
        const { day, month } = getDateParts(eventData.info.date);
        const ppv = isPPV(eventData.info.name, eventData.info.type);
        return (
          <button
            key={eventKey}
            className={`${styles.desktopEventRow} ${eventKey === selectedEventKey ? styles.desktopEventRowSelected : ''}`}
            onClick={() => onSelectEvent(eventKey)}
          >
            <div className={styles.dateChip}>
              <span className={styles.dateChipDay}>{day}</span>
              <span className={styles.dateChipMonth}>{month}</span>
            </div>
            <div className={styles.desktopEventRowInfo}>
              <div className={styles.desktopEventRowName}>
                {eventData.info.name}
                {ppv && <span className={styles.desktopPpvTag}>PPV</span>}
              </div>
              <div className={styles.desktopEventRowMeta}>
                {eventData.info.location || 'Location TBA'} &middot; {eventData.fights.length} fight{eventData.fights.length !== 1 ? 's' : ''}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default EventListSidebar;
```

`formatDate` is imported but unused directly here (date parts are derived locally to match the compact day/month chip format, the same split `UpcomingFights`'s `DateChip` uses) — remove the unused `formatDate` import so lint doesn't flag it:

```jsx
import { isPPV } from '../../utils/eventHelpers';
```

- [ ] **Step 2: Manually verify**

This is a presentational component with no pure-logic branch worth a Jest test (it's a thin map over props). It's exercised end-to-end in Task 7's manual verification once it's wired into `Events.js`. No standalone step here — proceed to Task 5.

- [ ] **Step 3: Commit**

```bash
git add ufc-tracker/src/components/Events/EventListSidebar.js
git commit -m "feat(events): add desktop EventListSidebar component"
```

---

### Task 5: `FightComparisonCard.js`

**Files:**
- Create: `ufc-tracker/src/components/Events/FightComparisonCard.js`

- [ ] **Step 1: Write the component**

```jsx
import React, { useState } from 'react';
import { Star, Crown, ChevronRight } from 'lucide-react';
import styles from '../../styles/Events.module.css';
import { getCountryCode } from '../../utils/countryCodes';
import { getRecentFights, formatRecord } from '../../utils/eventHelpers';
import { getFinishRateBreakdown, getRankLabelForDivision } from '../../utils/eventsDesktopHelpers';

const formatStat = (value, decimals = 2, suffix = '') => {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'string' && (value.includes('(') || value.includes('%'))) return value;
  const num = parseFloat(value);
  return !isNaN(num) ? num.toFixed(decimals) + suffix : value.toString();
};

const FighterHeader = ({ fighter, favorites, fightDivision }) => {
  const code = fighter?.country ? getCountryCode(fighter.country) : null;
  const rank = getRankLabelForDivision(fighter, fightDivision);
  const isFavorited = (favorites || []).length > 0;

  return (
    <div className={styles.cmpSide}>
      <img
        className={styles.cmpPortrait}
        src={fighter?.image_url || '/static/images/placeholder.jpg'}
        alt={fighter?.name || 'Fighter'}
        onError={(e) => { e.target.src = `https://via.placeholder.com/160x210/1a2338/f5f7fa?text=${fighter?.name?.charAt(0) || '?'}`; }}
      />
      <div className={styles.cmpName}>
        {rank?.isChampion && <Crown className={styles.cmpChampionCrown} size={15} aria-label="Champion" />}
        {isFavorited && <Star className={styles.cmpFavoriteStar} size={13} aria-label="On your list" />}
        <span>{fighter?.name || 'Unknown fighter'}</span>
      </div>
      {fighter?.nickname && <div className={styles.cmpNick}>&quot;{fighter.nickname}&quot;</div>}
      <div className={styles.cmpRec}>
        <span>{formatRecord(fighter)}</span>
        {fighter?.age ? <span>&middot; {fighter.age}</span> : null}
        {code && (
          <img
            className={styles.cmpFlag}
            src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
            alt={fighter.country}
            title={fighter.country}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
      </div>
      {rank && !rank.isChampion && <div className={styles.cmpRank}>{rank.label}</div>}
    </div>
  );
};

const StatRow = ({ label, f1, f2 }) => (
  <div className={styles.cmpStatRow}>
    <div className={styles.cmpStatValue}>{f1}</div>
    <div className={styles.cmpStatLabel}>{label}</div>
    <div className={styles.cmpStatValueRight}>{f2}</div>
  </div>
);

const RecentFightsColumn = ({ fighter }) => (
  <div className={styles.cmpRfCol}>
    {getRecentFights(fighter, 3).map((fight, i) => (
      <div key={i} className={styles.cmpRfItem}>
        <div className={`${styles.cmpRfChip} ${fight.result?.toLowerCase() === 'win' ? styles.cmpRfChipWin : styles.cmpRfChipLoss}`}>
          {fight.result?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <div className={styles.cmpRfOpp}>{fight.opponent}</div>
          <div className={styles.cmpRfMeta}>
            {fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}
            {fight.fight_date ? ` · ${new Date(`${fight.fight_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}` : ''}
          </div>
        </div>
      </div>
    ))}
    {getRecentFights(fighter, 3).length === 0 && <div className={styles.cmpRfMeta}>No recent fights</div>}
  </div>
);

const FightComparisonCard = ({ fight, fightDivision, onOpenBreakdown }) => {
  const [finishView, setFinishView] = useState('all');
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return <div className={styles.cmpCard}>Fighter data unavailable</div>;

  const f1Finish = getFinishRateBreakdown(f1, finishView);
  const f2Finish = getFinishRateBreakdown(f2, finishView);
  const denomLabel = finishView === 'all' ? 'fights' : finishView;

  return (
    <div className={styles.cmpCard}>
      <div className={styles.cmpGrid}>
        <FighterHeader fighter={f1} favorites={fight.fighter1_favorites} fightDivision={fightDivision} />
        <FighterHeader fighter={f2} favorites={fight.fighter2_favorites} fightDivision={fightDivision} />
        <div className={styles.cmpVs}>VS</div>

        <div className={styles.cmpSection}>Bio</div>
        <StatRow label="Height" f1={f1.height ? `${Math.floor(f1.height / 12)}'${f1.height % 12}"` : 'N/A'} f2={f2.height ? `${Math.floor(f2.height / 12)}'${f2.height % 12}"` : 'N/A'} />
        <StatRow label="Reach" f1={f1.reach ? `${f1.reach}"` : 'N/A'} f2={f2.reach ? `${f2.reach}"` : 'N/A'} />

        <div className={styles.cmpSection}>Striking</div>
        <StatRow label="Landed / Min" f1={formatStat(f1.sig_strikes_landed_per_min)} f2={formatStat(f2.sig_strikes_landed_per_min)} />
        <StatRow label="Absorbed / Min" f1={formatStat(f1.sig_strikes_absorbed_per_min)} f2={formatStat(f2.sig_strikes_absorbed_per_min)} />
        <StatRow label="Defense" f1={formatStat(f1.sig_str_defense)} f2={formatStat(f2.sig_str_defense)} />
        <StatRow label="Accuracy" f1={formatStat(f1.striking_accuracy)} f2={formatStat(f2.striking_accuracy)} />
        <StatRow label="Knockdown Avg" f1={formatStat(f1.knockdown_avg)} f2={formatStat(f2.knockdown_avg)} />

        <div className={styles.cmpSection}>Grappling</div>
        <StatRow label="TD Avg / 15" f1={formatStat(f1.takedown_avg_per_15min, 2)} f2={formatStat(f2.takedown_avg_per_15min, 2)} />
        <StatRow label="TD Defense" f1={formatStat(f1.takedown_defense)} f2={formatStat(f2.takedown_defense)} />
        <StatRow label="TD Accuracy" f1={formatStat(f1.takedown_accuracy)} f2={formatStat(f2.takedown_accuracy)} />
        <StatRow label="Sub Avg / 15" f1={formatStat(f1.submission_avg_per_15min, 2)} f2={formatStat(f2.submission_avg_per_15min, 2)} />

        <div className={styles.cmpFinishHead}>
          <div className={styles.cmpSection}>Finish rate</div>
          <div className={styles.cmpSegMiniGroup}>
            {['all', 'wins', 'losses'].map((key) => (
              <button
                key={key}
                className={`${styles.cmpSegMini} ${finishView === key ? styles.cmpSegMiniActive : ''}`}
                onClick={() => setFinishView(key)}
              >
                {key === 'all' ? 'All' : key === 'wins' ? 'Wins' : 'Losses'}
              </button>
            ))}
          </div>
        </div>
        <StatRow label={denomLabel} f1={f1Finish.total} f2={f2Finish.total} />
        <StatRow label="KO / TKO" f1={`${f1Finish.ko}%`} f2={`${f2Finish.ko}%`} />
        <StatRow label="Submission" f1={`${f1Finish.sub}%`} f2={`${f2Finish.sub}%`} />
        <StatRow label="Decision" f1={`${f1Finish.dec}%`} f2={`${f2Finish.dec}%`} />

        <div className={styles.cmpSection}>Last 3 fights</div>
        <RecentFightsColumn fighter={f1} />
        <RecentFightsColumn fighter={f2} />

        <button className={styles.cmpBreakdownLink} onClick={onOpenBreakdown}>
          Full fight breakdown <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};

export default FightComparisonCard;
```

- [ ] **Step 2: Commit**

```bash
git add ufc-tracker/src/components/Events/FightComparisonCard.js
git commit -m "feat(events): add desktop FightComparisonCard with finish-rate toggle"
```

---

### Task 6: `FightBreakdownPanel.js`

**Files:**
- Create: `ufc-tracker/src/components/Events/FightBreakdownPanel.js`

- [ ] **Step 1: Write the component**

```jsx
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import styles from '../../styles/Events.module.css';
import { getRecentFights } from '../../utils/eventHelpers';
import { getStrikePlacement, POSITION_LABELS, TARGET_LABELS } from '../../utils/eventsDesktopHelpers';

const SILHOUETTE_SHAPES = [
  { tag: 'circle', props: { cx: 30, cy: 14, r: 11 } },
  { tag: 'rect', props: { x: 12, y: 28, width: 36, height: 44, rx: 8 } },
  { tag: 'rect', props: { x: 2, y: 30, width: 10, height: 34, rx: 5 } },
  { tag: 'rect', props: { x: 48, y: 30, width: 10, height: 34, rx: 5 } },
  { tag: 'rect', props: { x: 14, y: 72, width: 14, height: 58, rx: 6 } },
  { tag: 'rect', props: { x: 32, y: 72, width: 14, height: 58, rx: 6 } },
];

// Maps each silhouette shape above to the target-placement region it
// represents, so its fill-opacity can reflect that region's share of
// total strikes (darker = more concentrated), matching the reference
// UFC.com "sig. str. by target" graphic.
const SHAPE_REGION_INDEX = [0, 1, 1, 1, 2, 2]; // head, body, body, body (torso+arms), leg, leg

const BodySilhouette = ({ targetPlacement, fillClass }) => (
  <svg viewBox="0 0 60 150" aria-hidden="true">
    <g className={styles.silBase}>
      {SILHOUETTE_SHAPES.map((shape, i) => React.createElement(shape.tag, { key: i, ...shape.props }))}
    </g>
    <g className={fillClass}>
      {SILHOUETTE_SHAPES.map((shape, i) => {
        const region = targetPlacement[SHAPE_REGION_INDEX[i]];
        const opacity = Math.max((region?.pct || 0) / 100, 0.08);
        return React.createElement(shape.tag, { key: i, ...shape.props, fillOpacity: opacity });
      })}
    </g>
  </svg>
);

const FighterBreakdownColumn = ({ fighter, fillClass }) => {
  const position = getStrikePlacement(fighter, 'sig_strikes_by_position', POSITION_LABELS);
  const target = getStrikePlacement(fighter, 'sig_strikes_by_target', TARGET_LABELS);
  const recent5 = getRecentFights(fighter, 5);

  return (
    <>
      <div className={styles.placementCol}>
        {position.map((item) => (
          <div key={item.label}>
            <div className={styles.placementItemTop}><span>{item.label}</span><b>{item.pct}%</b></div>
            <div className={styles.placementBar}>
              <div className={fillClass === styles.silFillGold ? styles.placementBarFill : styles.placementBarFillAlt} style={{ width: `${item.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className={styles.silhouetteCol}>
        <BodySilhouette targetPlacement={target} fillClass={fillClass} />
        <div className={styles.targetList}>
          {target.map((item) => (
            <div key={item.label} className={styles.targetRow}>
              <span className={styles.targetRegion}>{item.label}</span>
              <span className={styles.targetLeader} />
              <span className={styles.targetCount}>{item.count}</span>
              <span className={styles.targetPct}>{item.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.cmpRfCol}>
        {recent5.map((fight, i) => (
          <div key={i} className={styles.cmpRfItem}>
            <div className={`${styles.cmpRfChip} ${fight.result?.toLowerCase() === 'win' ? styles.cmpRfChipWin : styles.cmpRfChipLoss}`}>
              {fight.result?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <div className={styles.cmpRfOpp}>{fight.opponent}</div>
              <div className={styles.cmpRfMeta}>
                {fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}
                {fight.fight_date ? ` · ${new Date(`${fight.fight_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}` : ''}
              </div>
            </div>
          </div>
        ))}
        {recent5.length === 0 && <div className={styles.cmpRfMeta}>No recent fights</div>}
      </div>
    </>
  );
};

const FightBreakdownPanel = ({ fight, onBack }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;

  return (
    <div className={styles.cmpCard}>
      <button className={styles.breakdownBack} onClick={onBack}>
        <ArrowLeft size={14} /> Back to comparison
      </button>
      <div className={styles.cmpGrid}>
        <div className={styles.cmpName}>{f1.name}</div>
        <div className={styles.cmpName}>{f2.name}</div>

        <div className={styles.cmpSection}>Where strikes land · position</div>
        <div className={styles.placementWrap}>
          <FighterBreakdownColumn fighter={f1} fillClass={styles.silFillGold} />
        </div>

        <div className={styles.cmpSection}>Where strikes land · target</div>
        <div className={styles.placementWrap}>
          <FighterBreakdownColumn fighter={f2} fillClass={styles.silFillPersonal} />
        </div>

        <div className={styles.cmpSection}>Last 5 fights</div>
      </div>
    </div>
  );
};

export default FightBreakdownPanel;
```

**Note on this task's layout:** the grid above renders each fighter's position bars + target silhouette + last-5 together as one `FighterBreakdownColumn`, column-per-fighter (left = f1, right = f2), rather than the mockup's row-per-section (position row, then target row) layout — this is a deliberate simplification so the component doesn't need four separate `placementWrap` grids. Confirm this reads correctly against the approved mockup in Task 8's manual verification; if the per-fighter-column grouping reads worse than per-section rows once it's live, that's a quick follow-up CSS/markup tweak, not a redesign.

- [ ] **Step 2: Commit**

```bash
git add ufc-tracker/src/components/Events/FightBreakdownPanel.js
git commit -m "feat(events): add desktop FightBreakdownPanel (strike placement + last 5)"
```

---

### Task 7: `EventDetailPane.js`

**Files:**
- Create: `ufc-tracker/src/components/Events/EventDetailPane.js`

- [ ] **Step 1: Write the component**

```jsx
import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, ChevronRight } from 'lucide-react';
import styles from '../../styles/Events.module.css';
import { formatDate, formatTime, groupFightsBySection, getDivisionFromWeight } from '../../utils/eventHelpers';
import FightComparisonCard from './FightComparisonCard';
import FightBreakdownPanel from './FightBreakdownPanel';

const SECTION_ORDER = ['Main Card', 'Preliminary Card', 'Early Prelims'];
const SECTION_LABEL = { 'Main Card': 'Main Card', 'Preliminary Card': 'Prelims', 'Early Prelims': 'Early Prelims' };

const EventDetailPane = ({ eventKey, eventData }) => {
  const [activeSection, setActiveSection] = useState('Main Card');
  const [selectedFightId, setSelectedFightId] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Switching events (or sections) should return to the "pick a fight"
  // prompt rather than carrying over a selection from a different event —
  // the spec explicitly asks for no auto-expand/auto-select on this page.
  useEffect(() => {
    setSelectedFightId(null);
    setShowBreakdown(false);
  }, [eventKey]);

  useEffect(() => {
    setSelectedFightId(null);
    setShowBreakdown(false);
  }, [activeSection]);

  const sectioned = groupFightsBySection(eventData.fights);
  const sectionsPresent = SECTION_ORDER.filter((s) => (sectioned[s] || []).length > 0);
  const activeFights = sectioned[activeSection] || [];
  const selectedFight = activeFights.find((f) => f.id === selectedFightId) || null;
  const fightDivision = selectedFight
    ? getDivisionFromWeight(selectedFight.weight_class, selectedFight.fighter1_data, selectedFight.fighter2_data)
    : null;

  return (
    <div className={styles.desktopDetail}>
      <div className={styles.desktopEventHeader}>
        <h2>{eventData.info.name}</h2>
        <div className={styles.desktopEventMeta}>
          <span><Calendar size={13} /> {formatDate(eventData.info.date)}</span>
          <span><Calendar size={13} /> {formatTime(eventData.info.time)}</span>
          {eventData.info.location && <span><MapPin size={13} /> {eventData.info.location}</span>}
          <span><Users size={13} /> {eventData.fights.length} fight{eventData.fights.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className={styles.desktopSegmented}>
        {sectionsPresent.map((section) => (
          <button
            key={section}
            className={`${styles.desktopSegPill} ${activeSection === section ? styles.desktopSegPillActive : ''}`}
            onClick={() => setActiveSection(section)}
          >
            {SECTION_LABEL[section]}
          </button>
        ))}
      </div>

      {selectedFight && showBreakdown && (
        <FightBreakdownPanel fight={selectedFight} onBack={() => setShowBreakdown(false)} />
      )}

      {selectedFight && !showBreakdown && (
        <FightComparisonCard
          key={selectedFight.id}
          fight={selectedFight}
          fightDivision={fightDivision}
          onOpenBreakdown={() => setShowBreakdown(true)}
        />
      )}

      {!selectedFight && <div className={styles.desktopDetailEmpty}>Select a fight to see details</div>}

      {activeFights.map((fight) => {
        const f1 = fight.fighter1_data;
        const f2 = fight.fighter2_data;
        if (!f1 || !f2) return null;
        return (
          <button
            key={fight.id}
            className={`${styles.desktopFightRow} ${fight.id === selectedFightId ? styles.desktopFightRowSelected : ''}`}
            onClick={() => { setSelectedFightId(fight.id); setShowBreakdown(false); }}
          >
            <span className={styles.desktopFightRowTag}>{fight.card_section || ''}</span>
            <img
              className={styles.desktopFightRowAvatar}
              src={f1.image_url || '/static/images/placeholder.jpg'}
              alt=""
              onError={(e) => { e.target.src = `https://via.placeholder.com/60x60/1a2338/f5f7fa?text=${f1.name?.charAt(0) || '?'}`; }}
            />
            <span className={styles.desktopFightRowName}>{f1.name} <span style={{ color: 'var(--mute)' }}>vs</span> {f2.name}</span>
            <ChevronRight className={styles.desktopFightRowChevron} size={14} />
          </button>
        );
      })}
    </div>
  );
};

export default EventDetailPane;
```

- [ ] **Step 2: Commit**

```bash
git add ufc-tracker/src/components/Events/EventDetailPane.js
git commit -m "feat(events): add desktop EventDetailPane (segmented control + selection)"
```

---

### Task 8: Wire the desktop branch into `Events.js`

**Files:**
- Modify: `ufc-tracker/src/pages/Events.js`

- [ ] **Step 1: Add the desktop branch**

Replace the full contents of `ufc-tracker/src/pages/Events.js` with:

```jsx
import React, { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useEventData } from '../hooks/useEventData';
import { useMediaQuery } from '../hooks/useMediaQuery';
import EventCard from '../components/Events/EventCard';
import EventListSidebar from '../components/Events/EventListSidebar';
import EventDetailPane from '../components/Events/EventDetailPane';
import styles from '../styles/Events.module.css';

const Events = () => {
  const { sortedEvents, loading, error } = useEventData();
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [expandedFights, setExpandedFights] = useState(new Set());
  const [darkMode, setDarkMode] = useState(true);
  const [activeCardSections, setActiveCardSections] = useState({});
  const [selectedEventKey, setSelectedEventKey] = useState(null);
  const isDesktop = useMediaQuery('(min-width: 860px)');

  const toggleEvent = (eventKey) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventKey)) {
        newSet.delete(eventKey);
        const eventData = sortedEvents.find(([key]) => key === eventKey)?.[1];
        eventData?.fights.forEach(fight => {
          setExpandedFights(prevFights => {
            const newFightsSet = new Set(prevFights);
            newFightsSet.delete(fight.id);
            return newFightsSet;
          });
        });
        setActiveCardSections(prevSections => {
          const newSections = { ...prevSections };
          delete newSections[eventKey];
          return newSections;
        });
      } else {
        newSet.add(eventKey);
        setActiveCardSections(prev => ({
          ...prev,
          [eventKey]: 'Main Card'
        }));
      }
      return newSet;
    });
  };

  const toggleFight = (fightId) => {
    setExpandedFights(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fightId)) {
        newSet.delete(fightId);
      } else {
        newSet.add(fightId);
      }
      return newSet;
    });
  };

  // Show events that are upcoming OR up to 3 days past their date
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  cutoff.setHours(0, 0, 0, 0);
  const upcomingEvents = sortedEvents.filter(([, eventData]) => {
    const eventDate = new Date(eventData.info.date + 'T00:00:00');
    return eventDate >= cutoff;
  });

  const themeClass = darkMode ? 'dark' : 'light';

  if (loading) {
    return (
      <div className={styles.eventsContainer} data-theme={themeClass}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Loading upcoming events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.eventsContainer} data-theme={themeClass}>
        <div className={styles.errorState}>
          <h3>Error Loading Events</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    );
  }

  if (upcomingEvents.length === 0) {
    return (
      <div className={styles.eventsContainer} data-theme={themeClass}>
        <div className={styles.emptyState}>
          <h3>No Upcoming Events</h3>
          <p>Check back later for new fight announcements!</p>
        </div>
      </div>
    );
  }

  if (isDesktop) {
    const selectedEntry = upcomingEvents.find(([key]) => key === selectedEventKey);
    return (
      <div className={styles.desktopWrap} data-theme={themeClass}>
        <EventListSidebar
          sortedEvents={upcomingEvents}
          selectedEventKey={selectedEventKey}
          onSelectEvent={setSelectedEventKey}
        />
        {selectedEntry ? (
          <EventDetailPane eventKey={selectedEntry[0]} eventData={selectedEntry[1]} />
        ) : (
          <div className={styles.desktopDetail}>
            <div className={styles.desktopDetailEmpty}>Select an event to see its fight card</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.eventsContainer} data-theme={themeClass}>
      <header className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1>🥊 UFC Events</h1>
          <p>Complete fight cards and betting insights</p>
        </div>
        <button
          className={styles.themeToggle}
          onClick={() => setDarkMode(!darkMode)}
          title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      <div className={styles.eventsList}>
        {upcomingEvents.map(([eventKey, eventData]) => (
          <EventCard
            key={eventKey}
            eventKey={eventKey}
            eventData={eventData}
            isExpanded={expandedEvents.has(eventKey)}
            expandedFights={expandedFights}
            toggleEvent={toggleEvent}
            toggleFight={toggleFight}
            activeCardSections={activeCardSections}
            setActiveCardSections={setActiveCardSections}
          />
        ))}
      </div>
    </div>
  );
};

export default Events;
```

The only changes from the original file: the `isDesktop`/`useMediaQuery` check and the new `if (isDesktop)` branch inserted before the existing mobile `return`. Every mobile code path (state, handlers, the final `return`) is unchanged.

- [ ] **Step 2: Manual verification against the approved mockup**

```bash
cd ufc-tracker
npm start
```

Resize the browser window to ≥860px wide and open `/events`. Walk through this checklist against the approved mockup (`https://claude.ai/artifact/AsBsDLNidAhB6vZZsCpuGP`, Option C):

- Page loads with **no event selected** and no fight expanded (per the spec's explicit "no auto-expand" requirement).
- Clicking an event row in the sidebar loads its header, segmented control, and fight rows in the right pane; the clicked row gets a gold outline.
- With an event selected, the detail pane shows "Select a fight to see details" until a fight row is clicked.
- Clicking a fight row shows the full comparison card above the fight list, and that row gets a gold outline.
- Switching the Main Card / Prelims / Early Prelims segmented control clears the current selection back to the "select a fight" prompt (per Task 7's `useEffect`).
- In the comparison card: stat rows (Striking, Grappling) are centered under their labels (not left-smashed) — this is the exact layout bug found during the mockup round, so specifically check a row like "Takedown Accuracy" sits on its own full-width line.
- Clicking All / Wins / Losses on the finish-rate toggle changes both the KO/TKO/Submission/Decision percentages **and** the fight-count row above them.
- A favorited fighter shows a small blue star next to their name; a champion shows a gold crown.
- A country flag image renders next to each fighter's record line (confirms `getCountryCode` + flagcdn resolve correctly for at least one real fighter's country).
- Clicking "Full fight breakdown" swaps the comparison card for the strike-placement/silhouette/last-5 view; "Back to comparison" returns to the comparison card for the same fight.
- Resize the window below 860px — confirm the page falls back to the existing, completely unchanged mobile `EventCard`/`FightCard`/`BettingCard` experience (no desktop code renders a half-torn-down layout in the mobile view).

Fix anything that doesn't match before moving on — this is the actual acceptance test for this plan, since the components have no automated UI tests.

- [ ] **Step 3: Run the full test suite**

```bash
cd ufc-tracker
npx react-scripts test --watchAll=false
```

Expected: PASS — this should include the existing `upcomingFightsHelpers.test.js`, `eventHelpers.test.js`, `countryCodes.test.js` suites (untouched) plus the new `eventsDesktopHelpers.test.js` from Task 2.

- [ ] **Step 4: Commit**

```bash
git add ufc-tracker/src/pages/Events.js
git commit -m "feat(events): wire desktop list+detail layout into Events page"
```

---

## Self-Review

**Spec coverage** — every in-scope section of `2026-11-26-events-redesign-design.md` maps to a task:
- List+detail desktop layout → Tasks 4, 7, 8.
- No auto-expand/auto-select default → Task 7 (`selectedFightId` starts `null`, resets on event/section change), Task 8 (`selectedEventKey` starts `null`).
- Any fight row clickable (not just headline) → Task 7 renders every fight in the active section as a clickable row.
- Comparison block content (bio/striking/grappling/finish-rate+toggle+denominator/last-3) → Task 5.
- "Full fight breakdown" (strike placement position/target silhouette + last-5) → Task 6.
- Real flags, not emoji → Task 5 reuses the already-established `getCountryCode` + flagcdn pattern from `UpcomingFightsComponents.js` (confirmed this existed in the codebase during research — simpler and more consistent than inventing a new SVG icon set).
- Rank display (bare `#N` vs. `#N ABBR`) → `getRankLabelForDivision` in Task 2, used in Task 5.
- Finish-rate data-bug workaround (derive from `fight_history`, not the stale `ufc_losses_*` columns) → `getFinishRateBreakdown` in Task 2, with a regression test encoding the exact Diego Lopes scenario found during the mockup.
- Centered section headers within the comparison card only (not list rows) → `.cmpSection { text-align: center }` in Task 3; `.desktopFightRowName`/`.desktopEventRowName` etc. are left-aligned by not setting `text-align` at all.
- Championship Crown icon (not 👑 emoji) → Task 5's `FighterHeader`.
- Favorite star → Task 1 (data) + Task 5 (render).
- Mobile completely out of scope / unchanged → every task explicitly scopes its changes away from `EventCard.js`/`FightCard.js`/`BettingCard.js`/their CSS, and Task 8's diff is additive only.

**Placeholder scan** — no "TBD"/"TODO"/"add validation" instructions; every step has real, complete code. The one caveat called out explicitly (Task 6's per-fighter-column vs. per-section-row layout) is a named, scoped judgment call with a concrete fallback instruction, not a placeholder.

**Type/name consistency check:**
- `getFinishRateBreakdown(fighter, type)` — same signature and return shape (`{ ko, sub, dec, total }`) in its Task 2 definition, its Task 2 tests, and its Task 5 call sites.
- `getRankLabelForDivision(fighter, fightDivision)` → `{ isChampion, label } | null` — consistent between Task 2's implementation/tests and Task 5's usage (`rank?.isChampion`, `rank.label`).
- `getStrikePlacement(fighter, field, labels)` → array of `{ label, count, pct }` — consistent between Task 2 and Task 6's `FighterBreakdownColumn`.
- `POSITION_LABELS` / `TARGET_LABELS` exported from `eventsDesktopHelpers.js` in Task 2, imported by name in Task 6.
- CSS class names (`cmpCard`, `cmpGrid`, `cmpSide`, `cmpStatRow`, `cmpFinishHead`, `cmpSegMini`, `cmpRfCol`, `desktopFightRow`, `desktopEventRow`, `placementWrap`, `silhouetteCol`, `silFillGold`/`silFillPersonal`) are defined once in Task 3 and referenced by those exact names in Tasks 4–7 — no renamed/mismatched class references.
- `fight.fighter1_favorites`/`fighter2_favorites` — the shape Task 1 adds to `getEventData`'s return value matches exactly what Task 5's `FightComparisonCard` reads off `fight.fighter1_favorites`/`fight.fighter2_favorites`.

No gaps found.
