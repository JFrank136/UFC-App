# Upcoming Fights redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Upcoming Fights page (mobile) to match the approved design spec — no decorative colored borders, no gradients/glow/emoji, Bebas Neue reserved for fighter names, tall portrait photo treatment, per-fighter favorite stars instead of a redundant banner, banded event cards with a date chip, and a single "View full comparison" action per fight.

**Architecture:** Two pure logic functions (fight priority scoring, headline-fight selection) get extracted out of the page into a testable utils module. A new `UpcomingFightsComponents.js` holds the three new presentational pieces (`DateChip`, `HeadlineFightCard`, `CompactFightRow`). The page component keeps its existing data-fetching/filtering logic untouched and swaps its render layer for the new components and CSS. The `ComparisonModal` sub-component and its data-fetching effect are untouched apart from re-using the new CSS tokens.

**Tech Stack:** React 18 (CRA), CSS Modules, Supabase JS client, lucide-react icons, Jest + React Testing Library (already configured via `react-scripts test`).

**Decisions made during planning (flagging since they weren't pinned down in the mockup):**
- The mockup's "first name small / last name big" typographic split can't be done reliably in code — fighter names are a single `name` string with no structured surname field, and MMA has plenty of multi-word surnames (e.g. "Cortes Acosta") that a naive last-word split would mangle. The real implementation shows the **full name** in the large Bebas Neue treatment instead.
- The old inline "View Details" expand-for-stats panel on each fight card is consolidated into the existing "Compare Fighters" comparison modal — one action per fight ("View full comparison"), matching the single CTA in the approved mockup. The event-level expand/collapse (collapsing an entire event's fight list) is unrelated to this and is kept as-is.
- Real fighter photos (`fighter.image_url`, already in the data) are used for the portrait treatment — the mockup used solid-color initials blocks only because the Artifact sandbox blocks external images, not because that was the intended final look.
- Country is now shown as a 2-letter code (e.g. "IE", "RU") derived programmatically from the existing `countryCodes.js` flag-emoji map, rather than adding a second country-name-to-code data file. The mockup used 3-letter codes; 2-letter is the pragmatic choice given the data already on hand.
- This pass is mobile-first per the spec; on wider viewports the page stays a centered single column (`max-width: 480px`) rather than expanding into a multi-column grid, so it doesn't look broken until the dedicated desktop pass.

---

## Task 1: Self-hosted Bebas Neue font

**Files:**
- Create: `ufc-tracker/src/assets/fonts/BebasNeue-Regular.woff2`

- [ ] **Step 1: Create the fonts directory and download the font file**

Run:
```bash
mkdir -p ufc-tracker/src/assets/fonts
curl -s "https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2" -o ufc-tracker/src/assets/fonts/BebasNeue-Regular.woff2
```

- [ ] **Step 2: Verify the file downloaded correctly**

Run: `ls -la ufc-tracker/src/assets/fonts/BebasNeue-Regular.woff2`
Expected: a file around 13-14 KB (not 0 bytes, not an HTML error page).

- [ ] **Step 3: Commit**

```bash
git add ufc-tracker/src/assets/fonts/BebasNeue-Regular.woff2
git commit -m "feat: add self-hosted Bebas Neue font for the UI redesign"
```

---

## Task 2: 2-letter country code helper

**Files:**
- Modify: `ufc-tracker/src/utils/countryCodes.js`
- Test: `ufc-tracker/src/utils/countryCodes.test.js`

- [ ] **Step 1: Write the failing test**

Create `ufc-tracker/src/utils/countryCodes.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ufc-tracker && CI=true npx react-scripts test src/utils/countryCodes.test.js`
Expected: FAIL — `getCountryCode` is not exported from `./countryCodes`.

- [ ] **Step 3: Add the helper**

At the end of `ufc-tracker/src/utils/countryCodes.js` (after the closing `};` of the `countryCodes` object, replacing the existing `export default countryCodes;` line):

```js
const FLAG_BASE_CODEPOINT = 0x1f1e6; // regional indicator symbol 'A'

export const getCountryCode = (country) => {
  const flag = countryCodes[country];
  if (!flag) return null;
  const letters = Array.from(flag).map((char) => {
    const offset = char.codePointAt(0) - FLAG_BASE_CODEPOINT;
    return String.fromCharCode(65 + offset);
  });
  return letters.join('');
};

export default countryCodes;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ufc-tracker && CI=true npx react-scripts test src/utils/countryCodes.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add ufc-tracker/src/utils/countryCodes.js ufc-tracker/src/utils/countryCodes.test.js
git commit -m "feat: derive 2-letter country codes from the existing flag map"
```

---

## Task 3: Fight priority and headline-selection helpers

**Files:**
- Create: `ufc-tracker/src/utils/upcomingFightsHelpers.js`
- Test: `ufc-tracker/src/utils/upcomingFightsHelpers.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ufc-tracker/src/utils/upcomingFightsHelpers.test.js`:

```js
import { getFightPriorityScore, selectHeadlineFight, getDateParts } from './upcomingFightsHelpers';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ufc-tracker && CI=true npx react-scripts test src/utils/upcomingFightsHelpers.test.js`
Expected: FAIL — cannot find module `./upcomingFightsHelpers`.

- [ ] **Step 3: Create the helpers module**

Create `ufc-tracker/src/utils/upcomingFightsHelpers.js`:

```js
/**
 * Priority score for a fight based on whether either fighter is on the
 * user's list: 2 = a favorite is involved, 1 = only an interested fighter
 * is involved, 0 = neither.
 */
export const getFightPriorityScore = (fight) => {
  const allFavorites = [...(fight.fighter1_favorites || []), ...(fight.fighter2_favorites || [])];
  if (allFavorites.some((f) => f.priority === 'favorite')) return 2;
  if (allFavorites.some((f) => f.priority === 'interested')) return 1;
  return 0;
};

/**
 * Picks which fight in an event (already sorted by getFightPriorityScore
 * descending) gets the large "headline" card treatment, versus a compact
 * row. A single fight always gets the headline treatment. With multiple
 * fights, the top one gets it only if it strictly outranks the next —
 * otherwise nothing stands out enough and every fight renders compact.
 */
export const selectHeadlineFight = (fights) => {
  if (!fights || fights.length === 0) return null;
  if (fights.length === 1) return fights[0];
  const topScore = getFightPriorityScore(fights[0]);
  const secondScore = getFightPriorityScore(fights[1]);
  return topScore > secondScore ? fights[0] : null;
};

/**
 * Splits an event's "YYYY-MM-DD" date string into the parts the date chip
 * and event header need. Appends T00:00:00 so the Date is parsed in the
 * local timezone instead of UTC (avoids the classic off-by-one-day bug).
 */
export const getDateParts = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  return {
    day: date.getDate(),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
  };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ufc-tracker && CI=true npx react-scripts test src/utils/upcomingFightsHelpers.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add ufc-tracker/src/utils/upcomingFightsHelpers.js ufc-tracker/src/utils/upcomingFightsHelpers.test.js
git commit -m "feat: extract fight priority and headline-selection logic, with tests"
```

---

## Task 4: Rewrite `UpcomingFights.module.css`

**Files:**
- Modify: `ufc-tracker/src/styles/UpcomingFights.module.css` (full replace)

- [ ] **Step 1: Replace the entire file contents**

Replace the full contents of `ufc-tracker/src/styles/UpcomingFights.module.css` with:

```css
@font-face {
  font-family: 'Bebas Neue';
  src: url('../assets/fonts/BebasNeue-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

.pageContainer {
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  transition: background 0.3s ease, color 0.3s ease;
}

.pageContainer[data-theme="dark"] {
  --bg: #05070c;
  --card: #151d31;
  --text: #f5f7fa;
  --mute: #7b8698;
  --accent: #7fa3e0;
  --gold: #facc15;
  --portrait: #212c47;
  --portraitInk: #4a5a80;
  --line: #262f47;
  --chipOn: #7fa3e0;
  --chipOnInk: #05070c;
  background: var(--bg);
  color: var(--text);
}

.pageContainer[data-theme="light"] {
  --bg: #dde3ed;
  --card: #ffffff;
  --text: #1e293b;
  --mute: #64748b;
  --accent: #2563eb;
  --gold: #a16207;
  --portrait: #e2e8f0;
  --portraitInk: #94a3b8;
  --line: #e7eaef;
  --chipOn: #2563eb;
  --chipOnInk: #ffffff;
  background: var(--bg);
  color: var(--text);
}

/* Loading / error states */
.loadingContainer, .errorContainer {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
  padding: 2rem;
}

.spinner {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
  border: 3px solid var(--line);
  border-top-color: var(--accent);
}

.errorContainer svg { color: #ef4444; margin-bottom: 1rem; }
.errorContainer h3 { color: #ef4444; margin-bottom: 1rem; }
.errorContainer p { color: var(--mute); margin-bottom: 2rem; }
.errorContainer button {
  background: #ef4444;
  color: #fff;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Page shell */
.content {
  max-width: 480px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
}

/* Header */
.pageHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.25rem;
  gap: 1rem;
}

.pageTitle {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 2rem;
  letter-spacing: 0.5px;
  line-height: 1;
  margin: 0;
}

.pageSub {
  font-size: 0.8rem;
  color: var(--mute);
  margin: 0.4rem 0 0;
}

.themeToggle {
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  color: var(--mute);
  display: flex;
}

.themeToggle:hover { color: var(--text); }

/* Countdown */
.countdown {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.countdownNumber {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.4rem;
  color: var(--accent);
  letter-spacing: 0.5px;
}

.countdownCaption { font-size: 0.8rem; color: var(--mute); }

/* Search + filters */
.searchBar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  background: var(--card);
  margin-bottom: 0.6rem;
}

.searchBar svg { color: var(--mute); flex-shrink: 0; }

.searchBar input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 0.85rem;
  color: var(--text);
}

.searchBar input::placeholder { color: var(--mute); }

.clearSearch {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  color: var(--mute);
}

.clearSearch:hover { color: var(--text); }

.filterChips { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }

.chip {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.35rem 0.85rem;
  border-radius: 14px;
  color: var(--mute);
  background: transparent;
  border: none;
  cursor: pointer;
}

.chipOn { color: var(--chipOnInk); background: var(--chipOn); }

/* Event cards */
.eventsContainer { display: flex; flex-direction: column; gap: 1rem; }

.eventCard {
  background: var(--card);
  border-radius: 14px;
  overflow: hidden;
}

.eventHeader {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  background: var(--bg);
  padding: 0.85rem 1rem;
  cursor: pointer;
  border: none;
  width: 100%;
  text-align: left;
}

.dateChip {
  width: 42px;
  flex-shrink: 0;
  background: var(--card);
  border-radius: 8px;
  padding: 0.4rem 0;
  text-align: center;
}

.dateChipDay {
  display: block;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.2rem;
  line-height: 1;
  color: var(--text);
}

.dateChipMonth {
  display: block;
  font-size: 0.6rem;
  letter-spacing: 0.5px;
  color: var(--mute);
  margin-top: 0.2rem;
}

.eventInfo { flex: 1; padding-top: 0.15rem; min-width: 0; }
.eventName { font-size: 0.9rem; font-weight: 500; color: var(--text); }
.eventWhen { font-size: 0.75rem; color: var(--mute); margin-top: 0.2rem; }
.eventBreakdown { font-size: 0.75rem; color: var(--mute); margin-top: 0.15rem; }
.eventExpandIcon { color: var(--mute); flex-shrink: 0; margin-top: 0.2rem; display: flex; }

.eventBody { padding: 0.6rem 1rem 0.2rem; }

/* Headline fight */
.headline { padding: 0.6rem 0 0.75rem; }
.matchup { display: flex; align-items: flex-end; justify-content: center; }
.fighterColumn { text-align: center; flex: 1; min-width: 0; }

.portrait {
  width: 100%;
  height: 108px;
  border-radius: 10px 10px 4px 4px;
  background: var(--portrait);
  color: var(--portraitInk);
  object-fit: cover;
  object-position: center top;
  display: block;
}

.fighterName {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.25rem;
  letter-spacing: 0.4px;
  line-height: 1.05;
  color: var(--text);
  margin-top: 0.5rem;
}

.fighterName.champion { color: var(--gold); }

.followedStar { font-size: 0.75rem; color: var(--gold); margin-left: 0.25rem; vertical-align: 1px; }

.fighterMeta { font-size: 0.7rem; color: var(--mute); margin-top: 0.3rem; }

.vsColumn { width: 30px; text-align: center; flex-shrink: 0; padding-bottom: 1.75rem; }

.vsMark {
  display: inline-block;
  transform: rotate(-8deg);
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1rem;
  color: var(--mute);
  opacity: 0.7;
}

.compareLink {
  display: block;
  text-align: center;
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
  background: none;
  border-left: none;
  border-right: none;
  border-bottom: none;
  width: 100%;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--accent);
}

/* Compact fight row */
.compactRow {
  border-top: 1px solid var(--line);
  padding: 0.6rem 0;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: none;
  border-left: none;
  border-right: none;
  border-bottom: none;
  width: 100%;
  cursor: pointer;
  text-align: left;
}

.compactRowTag { font-size: 0.55rem; color: var(--mute); width: 42px; flex-shrink: 0; }

.compactRowAvatar {
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background: var(--portrait);
  object-fit: cover;
  flex-shrink: 0;
}

.compactRowName {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.3px;
  flex: 1;
  color: var(--text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compactRowName .vsWord { color: var(--mute); font-family: inherit; }
.compactRowChevron { color: var(--mute); flex-shrink: 0; }

/* Recent-fight rows (shared with the comparison modal) */
.fightResult {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  background: var(--card);
}

.resultIndicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
}

.win .resultIndicator { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
.loss .resultIndicator { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.method { color: var(--mute); font-size: 0.78rem; margin-left: auto; }
.noFights { color: var(--mute); font-style: italic; font-size: 0.82rem; }

/* Comparison modal */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.comparisonModal {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 20px;
  max-width: 500px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  color: var(--text);
}

.closeBtn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: var(--bg);
  border: none;
  border-radius: 8px;
  padding: 0.5rem;
  color: var(--text);
  cursor: pointer;
  display: flex;
}

.closeBtn:hover { opacity: 0.8; }

.comparisonTitle {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.4rem;
  letter-spacing: 0.5px;
  text-align: center;
  padding: 1.5rem 1.5rem 0;
  margin: 0;
  color: var(--text);
}

.comparisonHeader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: 1.5rem;
  flex-wrap: wrap;
}

.fighterSummaryModal { text-align: center; flex: 1; min-width: 120px; }

.comparisonImageContainer img {
  width: 90px;
  height: 90px;
  border-radius: 10px;
  object-fit: cover;
  object-position: center top;
  margin-bottom: 0.5rem;
}

.fighterSummaryModal h3 { margin: 0 0 0.25rem 0; font-size: 1rem; }
.fighterSummaryModal p { margin: 0 0 0.25rem 0; color: var(--mute); font-size: 0.85rem; font-style: italic; }
.modalRecord { font-weight: 700; color: var(--accent); }
.vsDivider { font-size: 1.4rem; font-weight: 800; color: var(--mute); }

.comparisonStats { padding: 0 1.5rem 1.5rem; }

.statComparison {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
  padding: 0.6rem;
  background: var(--bg);
  border-radius: 8px;
}

.statValue { font-size: 0.9rem; font-weight: 600; text-align: center; color: var(--mute); }
.statValue.better { color: #4ade80; }
.statLabel { color: var(--mute); font-size: 0.8rem; text-align: center; min-width: 100px; }

.recentFightsComparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  padding: 1.5rem;
  border-top: 1px solid var(--line);
}

.recentFightsCol { display: flex; flex-direction: column; gap: 0.35rem; }
.recentFightsCol h4 { font-size: 0.9rem; margin: 0 0 0.75rem 0; text-align: center; color: var(--mute); }

/* Responsive */
@media (max-width: 420px) {
  .content { padding: 1.25rem 0.85rem 1.5rem; }
  .pageTitle { font-size: 1.7rem; }
  .portrait { height: 92px; }
  .fighterName { font-size: 1.05rem; }
  .recentFightsComparison { grid-template-columns: 1fr; }
  .statComparison { grid-template-columns: 1fr; text-align: center; }
}
```

- [ ] **Step 2: Commit**

```bash
git add ufc-tracker/src/styles/UpcomingFights.module.css
git commit -m "feat: rewrite Upcoming Fights stylesheet per the UI redesign spec"
```

This will temporarily leave `UpcomingFights.js` referencing CSS classes that no longer exist (broken visually, not a build error — CSS Modules just won't match). That's fixed in Task 6.

---

## Task 5: New presentational components

**Files:**
- Create: `ufc-tracker/src/components/UpcomingFightsComponents.js`

- [ ] **Step 1: Create the components file**

```jsx
import React from 'react';
import { Crown, Star, ChevronRight } from 'lucide-react';
import styles from '../styles/UpcomingFights.module.css';
import { getCountryCode } from '../utils/countryCodes';

export const DateChip = ({ day, month }) => (
  <div className={styles.dateChip}>
    <span className={styles.dateChipDay}>{day}</span>
    <span className={styles.dateChipMonth}>{month}</span>
  </div>
);

const FighterColumn = ({ fighter, favorites, rankInfo, formatRecord }) => {
  const countryLabel = fighter.country ? getCountryCode(fighter.country) || fighter.country : null;
  const metaParts = [];
  if (rankInfo.label) metaParts.push(rankInfo.label);
  metaParts.push(formatRecord(fighter));
  if (countryLabel) metaParts.push(countryLabel);

  return (
    <div className={styles.fighterColumn}>
      <img
        className={styles.portrait}
        src={fighter.image_url || '/static/images/placeholder.jpg'}
        alt={fighter.name || 'Fighter'}
        onError={(e) => { e.target.src = `https://via.placeholder.com/160x200/1a2338/f5f7fa?text=${fighter.name?.charAt(0) || '?'}`; }}
      />
      <div className={`${styles.fighterName} ${rankInfo.isChampion ? styles.champion : ''}`}>
        {fighter.name || 'Unknown fighter'}
        {favorites?.length > 0 && <Star className={styles.followedStar} size={11} aria-label="On your list" />}
      </div>
      <div className={styles.fighterMeta}>
        {rankInfo.isChampion && <Crown size={11} style={{ verticalAlign: '-1px', marginRight: '3px' }} aria-hidden="true" />}
        {metaParts.join(' · ')}
      </div>
    </div>
  );
};

export const HeadlineFightCard = ({ fight, f1Rank, f2Rank, formatRecord, onCompare }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;

  return (
    <div className={styles.headline}>
      <div className={styles.matchup}>
        <FighterColumn fighter={f1} favorites={fight.fighter1_favorites} rankInfo={f1Rank} formatRecord={formatRecord} />
        <div className={styles.vsColumn}><span className={styles.vsMark}>VS</span></div>
        <FighterColumn fighter={f2} favorites={fight.fighter2_favorites} rankInfo={f2Rank} formatRecord={formatRecord} />
      </div>
      <button className={styles.compareLink} onClick={() => onCompare(fight)}>
        View full comparison &rarr;
      </button>
    </div>
  );
};

export const CompactFightRow = ({ fight, sectionLabel, onCompare }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;
  const f1Followed = fight.fighter1_favorites?.length > 0;
  const f2Followed = fight.fighter2_favorites?.length > 0;

  return (
    <button className={styles.compactRow} onClick={() => onCompare(fight)}>
      <span className={styles.compactRowTag}>{sectionLabel}</span>
      <img
        className={styles.compactRowAvatar}
        src={f1.image_url || '/static/images/placeholder.jpg'}
        alt=""
        onError={(e) => { e.target.src = `https://via.placeholder.com/60x60/1a2338/f5f7fa?text=${f1.name?.charAt(0) || '?'}`; }}
      />
      <span className={styles.compactRowName}>
        {f1.name}
        {f1Followed && <Star className={styles.followedStar} size={10} aria-label="On your list" />}
        {' '}<span className={styles.vsWord}>vs</span>{' '}
        {f2.name}
        {f2Followed && <Star className={styles.followedStar} size={10} aria-label="On your list" />}
      </span>
      <ChevronRight className={styles.compactRowChevron} size={14} aria-hidden="true" />
    </button>
  );
};
```

- [ ] **Step 2: Verify the app still compiles**

Run: `cd ufc-tracker && CI=true npx react-scripts build`
Expected: build succeeds (this file isn't imported anywhere yet, so this just checks for syntax errors).

- [ ] **Step 3: Commit**

```bash
git add ufc-tracker/src/components/UpcomingFightsComponents.js
git commit -m "feat: add DateChip, HeadlineFightCard, CompactFightRow components"
```

---

## Task 6: Wire the new page together

**Files:**
- Modify: `ufc-tracker/src/pages/UpcomingFights.js` (full replace)

- [ ] **Step 1: Replace the entire file contents**

Replace the full contents of `ufc-tracker/src/pages/UpcomingFights.js` with:

```jsx
import React, { useEffect, useState, useMemo } from 'react';
import { Search, X, AlertCircle, ChevronDown, ChevronUp, Sun, Moon } from 'lucide-react';
import supabase from '../api/supabaseClient';
import { getFullUpcomingFights } from '../api/supabaseQueries';
import { getFightPriorityScore, selectHeadlineFight, getDateParts } from '../utils/upcomingFightsHelpers';
import { DateChip, HeadlineFightCard, CompactFightRow } from '../components/UpcomingFightsComponents';
import styles from '../styles/UpcomingFights.module.css';

const UpcomingFights = () => {
  const [fights, setFights] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [comparingFighters, setComparingFighters] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const fetchFightsWithFavorites = async () => {
      try {
        setLoading(true);
        setError(null);
        const upcomingFights = await getFullUpcomingFights();
        const { data: userFavorites, error: favError } = await supabase
          .from('user_favorites')
          .select('*');
        if (favError) throw favError;

        const fightsWithFavorites = upcomingFights.filter(fight => {
          const f1Favs = userFavorites.filter(fav => fav.fighter_id === fight.fighter1_id);
          const f2Favs = userFavorites.filter(fav => fav.fighter_id === fight.fighter2_id);
          return f1Favs.length > 0 || f2Favs.length > 0;
        }).map(fight => ({
          ...fight,
          fighter1_favorites: userFavorites.filter(fav => fav.fighter_id === fight.fighter1_id),
          fighter2_favorites: userFavorites.filter(fav => fav.fighter_id === fight.fighter2_id),
          fighter1_data: fight.fighter1_data || {},
          fighter2_data: fight.fighter2_data || {}
        }));

        setFights(fightsWithFavorites);
      } catch (err) {
        console.error('Error fetching fights:', err);
        setError('Failed to load upcoming fights. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchFightsWithFavorites();
  }, []);

  const nextEvent = useMemo(() => {
    if (fights.length === 0) return null;
    const now = new Date();
    const upcoming = fights
      .map(f => ({ date: new Date(f.event_date + 'T' + (f.event_time || '00:00')), event: f.event }))
      .filter(f => f.date > now)
      .sort((a, b) => a.date - b.date)[0];
    if (!upcoming) return null;
    const days = Math.max(1, Math.ceil((upcoming.date - now) / (1000 * 60 * 60 * 24)));
    return { days, event: upcoming.event };
  }, [fights]);

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const filteredFights = useMemo(() => {
    let filtered = fights.filter(fight => {
      const eventDate = new Date(fight.event_date + 'T00:00:00');
      return eventDate >= cutoff;
    });

    if (searchQuery.trim()) {
      filtered = filtered.filter(fight =>
        fight.fighter1_data?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fight.fighter2_data?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fight.fighter1_data?.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fight.fighter2_data?.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fight.event?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (priorityFilter !== 'All') {
      filtered = filtered.filter(fight =>
        fight.fighter1_favorites?.some(f => f.priority === priorityFilter.toLowerCase()) ||
        fight.fighter2_favorites?.some(f => f.priority === priorityFilter.toLowerCase())
      );
    }

    return filtered;
  }, [fights, searchQuery, priorityFilter, cutoff]);

  const groupedFights = useMemo(() => {
    const groups = {};
    filteredFights.forEach(fight => {
      const key = fight.event;
      if (!groups[key]) {
        groups[key] = { date: fight.event_date, time: fight.event_time, fights: [] };
      }
      groups[key].fights.push(fight);
    });
    Object.values(groups).forEach(group => {
      group.fights.sort((a, b) => {
        const pDiff = getFightPriorityScore(b) - getFightPriorityScore(a);
        if (pDiff !== 0) return pDiff;
        return (b.fight_order || 0) - (a.fight_order || 0);
      });
    });
    return groups;
  }, [filteredFights]);

  useEffect(() => {
    if (Object.keys(groupedFights).length > 0) {
      setExpandedEvents(new Set(Object.keys(groupedFights)));
    }
  }, [groupedFights]);

  const toggleEventExpansion = (eventName) => {
    setExpandedEvents(prev => {
      const s = new Set(prev);
      s.has(eventName) ? s.delete(eventName) : s.add(eventName);
      return s;
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'Time TBA';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm} EST`;
  };

  const formatRecord = (fighter) => {
    if (!fighter) return 'N/A';
    const wins = fighter.ufc_wins_total ?? fighter.wins_total ?? 0;
    const losses = fighter.ufc_losses_total ?? fighter.losses_total ?? 0;
    const draws = fighter.ufc_draws_total ?? fighter.draws_total ?? 0;
    return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
  };

  const formatStat = (value, decimals = 2, suffix = '') => {
    if (!value) return 'N/A';
    if (typeof value === 'string' && value.includes('(')) return value;
    const num = parseFloat(value);
    return !isNaN(num) ? num.toFixed(decimals) + suffix : value.toString();
  };

  const getRecentFights = (fighter, limit = 3) => {
    if (!fighter?.fight_history) return [];
    return fighter.fight_history
      .sort((a, b) => new Date(b.fight_date) - new Date(a.fight_date))
      .slice(0, limit);
  };

  const getRankDisplay = (fighter) => {
    if (!fighter?.rankings || fighter.rankings.length === 0) return { divisional: null, p4p: null };
    const p4p = fighter.rankings.find(r => r.division?.toLowerCase().includes('pound-for-pound'));
    const divRank = fighter.rankings.find(r => !r.division?.toLowerCase().includes('pound-for-pound'));
    return { divisional: divRank, p4p };
  };

  const getFighterRankInfo = (fighter) => {
    const { divisional, p4p } = getRankDisplay(fighter);
    if (divisional?.rank === 'C') return { isChampion: true, label: 'Champion' };
    if (divisional) return { isChampion: false, label: `Rank ${divisional.rank}` };
    if (p4p) return { isChampion: false, label: `P4P #${p4p.rank}` };
    return { isChampion: false, label: null };
  };

  const getFightOutcomeStats = (fighter, type = 'all') => {
    if (!fighter?.fight_history || fighter.fight_history.length === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
    let fightList = fighter.fight_history;
    if (type === 'wins') fightList = fightList.filter(f => f.result?.toLowerCase() === 'win');
    else if (type === 'losses') fightList = fightList.filter(f => f.result?.toLowerCase() === 'loss');
    const total = fightList.length;
    if (total === 0) return { ko: 0, sub: 0, dec: 0, total: 0 };
    const ko = fightList.filter(f => f.method?.toLowerCase().match(/ko|tko|knockout/)).length;
    const sub = fightList.filter(f => f.method?.toLowerCase().match(/sub|submission|tap/)).length;
    const dec = fightList.filter(f => f.method?.toLowerCase().match(/decision|unanimous|majority|split/)).length;
    return {
      ko: Math.round((ko / total) * 100),
      sub: Math.round((sub / total) * 100),
      dec: Math.round((dec / total) * 100),
      total
    };
  };

  const getCardSectionInfo = (cardSection) => {
    const raw = cardSection || '';
    if (raw === 'Main Event') return 'Main event';
    if (raw === 'Co-Main') return 'Co-main';
    if (raw === 'Main Card' || raw === 'Main') return 'Main card';
    if (raw === 'Preliminary Card' || raw === 'Prelim' || raw === 'Prelims') return 'Prelim';
    if (raw === 'Early Prelims') return 'Early prelims';
    return raw || 'TBA';
  };

  const getEventPriority = (eventFights) => {
    let favorites = 0;
    let interested = 0;
    eventFights.forEach(fight => {
      [...(fight.fighter1_favorites || []), ...(fight.fighter2_favorites || [])].forEach(fav => {
        if (fav.priority === 'favorite') favorites++;
        else if (fav.priority === 'interested') interested++;
      });
    });
    return { favorites, interested };
  };

  const ComparisonModal = ({ fight, onClose }) => {
    if (!fight) return null;
    const f1 = fight.fighter1_data;
    const f2 = fight.fighter2_data;
    if (!f1 || !f2) return null;

    const statComparisons = [
      { label: 'Age', f1: f1.age || 'N/A', f2: f2.age || 'N/A', inverse: true },
      { label: 'Height', f1: f1.height ? f1.height + '"' : 'N/A', f2: f2.height ? f2.height + '"' : 'N/A' },
      { label: 'Reach', f1: f1.reach ? f1.reach + '"' : 'N/A', f2: f2.reach ? f2.reach + '"' : 'N/A' },
      { label: 'Fight Finishes',
        f1: (() => { const s = getFightOutcomeStats(f1); return s.total > 0 ? `${s.ko}% KO, ${s.dec}% Dec, ${s.sub}% Sub` : 'N/A'; })(),
        f2: (() => { const s = getFightOutcomeStats(f2); return s.total > 0 ? `${s.ko}% KO, ${s.dec}% Dec, ${s.sub}% Sub` : 'N/A'; })()
      },
      { label: 'Strikes/Min', f1: formatStat(f1.strikes_landed_per_min), f2: formatStat(f2.strikes_landed_per_min) },
      { label: 'Strike Defense', f1: formatStat(f1.striking_defense), f2: formatStat(f2.striking_defense) },
      { label: 'Takedowns/15min', f1: formatStat(f1.takedown_avg, 1), f2: formatStat(f2.takedown_avg, 1) },
      { label: 'KO/TKO Wins', f1: f1.wins_ko || 0, f2: f2.wins_ko || 0 },
      { label: 'Submission Wins', f1: f1.wins_sub || 0, f2: f2.wins_sub || 0 }
    ];

    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.comparisonModal} onClick={e => e.stopPropagation()}>
          <button className={styles.closeBtn} onClick={onClose}><X size={24} /></button>
          <h2 className={styles.comparisonTitle}>Fighter comparison</h2>
          <div className={styles.comparisonHeader}>
            {[f1, f2].map((fighter, idx) => (
              <div key={idx} className={styles.fighterSummaryModal}>
                <div className={styles.comparisonImageContainer}>
                  <img src={fighter.image_url || '/static/images/placeholder.jpg'} alt={fighter.name}
                    onError={e => { e.target.src = `https://via.placeholder.com/100x100/1a2338/f5f7fa?text=${fighter.name?.charAt(0) || '?'}`; }} />
                </div>
                <h3>{fighter.name}</h3>
                <p>{fighter.nickname || ''}</p>
                <div className={styles.modalRecord}>{formatRecord(fighter)}</div>
              </div>
            )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <div key="vs" className={styles.vsDivider}>VS</div>, el], [])}
          </div>
          <div className={styles.comparisonStats}>
            {statComparisons.map((stat, idx) => {
              const f1Val = parseFloat(stat.f1) || 0;
              const f2Val = parseFloat(stat.f2) || 0;
              const f1Better = stat.inverse ? f1Val < f2Val && f1Val > 0 : f1Val > f2Val;
              const f2Better = stat.inverse ? f2Val < f1Val && f2Val > 0 : f2Val > f1Val;
              return (
                <div key={idx} className={styles.statComparison}>
                  <div className={`${styles.statValue} ${f1Better ? styles.better : ''}`}>{stat.f1}</div>
                  <div className={styles.statLabel}>{stat.label}</div>
                  <div className={`${styles.statValue} ${f2Better ? styles.better : ''}`}>{stat.f2}</div>
                </div>
              );
            })}
          </div>
          <div className={styles.recentFightsComparison}>
            {[f1, f2].map((fighter, idx) => (
              <div key={idx} className={styles.recentFightsCol}>
                <h4>{fighter.name} recent fights</h4>
                {getRecentFights(fighter).map((fight, i) => (
                  <div key={i} className={`${styles.fightResult} ${styles[fight.result?.toLowerCase() || '']}`}>
                    <span className={styles.resultIndicator}>{fight.result?.charAt(0)?.toUpperCase() || '?'}</span>
                    <span>{fight.opponent || 'Unknown'}</span>
                    <span className={styles.method}>{fight.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                  </div>
                ))}
                {getRecentFights(fighter).length === 0 && <div className={styles.noFights}>No recent fights</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const theme = darkMode ? 'dark' : 'light';

  if (loading) return (
    <div className={styles.pageContainer} data-theme={theme}>
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading upcoming fights...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className={styles.pageContainer} data-theme={theme}>
      <div className={styles.errorContainer}>
        <AlertCircle size={48} />
        <h3>Error loading fights</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </div>
    </div>
  );

  return (
    <div className={styles.pageContainer} data-theme={theme}>
      <div className={styles.content}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Upcoming fights</h1>
            <p className={styles.pageSub}>
              {filteredFights.length} fights across {Object.keys(groupedFights).length} events you follow
            </p>
          </div>
          <button className={styles.themeToggle} onClick={() => setDarkMode(!darkMode)}
            title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        {nextEvent && (
          <div className={styles.countdown}>
            <span className={styles.countdownNumber}>{nextEvent.days} day{nextEvent.days !== 1 ? 's' : ''}</span>
            <span className={styles.countdownCaption}>until {nextEvent.event}</span>
          </div>
        )}

        <div className={styles.searchBar}>
          <Search size={16} aria-hidden="true" />
          <input type="text" placeholder="Search fighters or events"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => setSearchQuery('')} aria-label="Clear search"><X size={14} /></button>
          )}
        </div>

        <div className={styles.filterChips}>
          {['All', 'Favorite', 'Interested'].map(option => (
            <button
              key={option}
              className={`${styles.chip} ${priorityFilter === option ? styles.chipOn : ''}`}
              onClick={() => setPriorityFilter(option)}
            >
              {option === 'Favorite' ? 'Favorites' : option}
            </button>
          ))}
        </div>

        {Object.keys(groupedFights).length === 0 ? (
          <p className={styles.pageSub}>No upcoming fights found for your selected criteria</p>
        ) : (
          <div className={styles.eventsContainer}>
            {Object.entries(groupedFights)
              .sort(([, a], [, b]) => new Date(a.date) - new Date(b.date))
              .map(([eventName, eventData]) => {
                const { day, month, weekday } = getDateParts(eventData.date);
                const { favorites, interested } = getEventPriority(eventData.fights);
                const breakdownParts = [];
                if (favorites > 0) breakdownParts.push(`${favorites} favorite${favorites > 1 ? 's' : ''}`);
                if (interested > 0) breakdownParts.push(`${interested} interested`);
                const isExpanded = expandedEvents.has(eventName);
                const headline = selectHeadlineFight(eventData.fights);
                const otherFights = eventData.fights.filter(f => f !== headline);

                return (
                  <div key={eventName} className={styles.eventCard}>
                    <button className={styles.eventHeader} onClick={() => toggleEventExpansion(eventName)}>
                      <DateChip day={day} month={month} />
                      <div className={styles.eventInfo}>
                        <div className={styles.eventName}>{eventName}</div>
                        <div className={styles.eventWhen}>{weekday} &middot; {formatTime(eventData.time)}</div>
                        {breakdownParts.length > 0 && (
                          <div className={styles.eventBreakdown}>{breakdownParts.join(' · ')}</div>
                        )}
                      </div>
                      <span className={styles.eventExpandIcon}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className={styles.eventBody}>
                        {headline && (
                          <HeadlineFightCard
                            fight={headline}
                            f1Rank={getFighterRankInfo(headline.fighter1_data)}
                            f2Rank={getFighterRankInfo(headline.fighter2_data)}
                            formatRecord={formatRecord}
                            onCompare={setComparingFighters}
                          />
                        )}
                        {otherFights.map(fight => (
                          <CompactFightRow
                            key={fight.id}
                            fight={fight}
                            sectionLabel={getCardSectionInfo(fight.card_section)}
                            onCompare={setComparingFighters}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {comparingFighters && <ComparisonModal fight={comparingFighters} onClose={() => setComparingFighters(null)} />}
    </div>
  );
};

export default UpcomingFights;
```

- [ ] **Step 2: Run the unit tests**

Run: `cd ufc-tracker && CI=true npx react-scripts test`
Expected: all suites pass (App.test.js, countryCodes.test.js, upcomingFightsHelpers.test.js).

- [ ] **Step 3: Verify it builds clean**

Run: `cd ufc-tracker && CI=true npx react-scripts build`
Expected: build succeeds with no new warnings about unused variables (the old inline `formatDate`, `getUserLabels`, `getWeightClassName`, `getDivisionFromRankings`, expand-state handlers are gone, not left dangling).

- [ ] **Step 4: Commit**

```bash
git add ufc-tracker/src/pages/UpcomingFights.js
git commit -m "feat: rebuild Upcoming Fights page with the new design system"
```

---

## Task 7: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server and open it at mobile width**

Use the preview tool to start the `ufc-tracker` dev server (`.claude/launch.json` already has this configured), navigate to `/upcoming`, and resize the browser pane to the mobile preset (375x812).

- [ ] **Step 2: Check against the spec, dark mode**

Confirm, against `docs/superpowers/specs/2026-08-15-ui-overhaul-upcoming-fights-design.md`:
- No emoji anywhere (header, badges, flags)
- No colored border accents on any card
- Fighter names render in the condensed display font; event names and body text don't
- Each event is a distinct card with a darker banded header containing a date chip
- The one standout followed fight per event (if any) renders large with real photos in the portrait treatment; other followed fights render as compact single-line rows
- Favorited/interested fighters show a small star next to their name; there is no "on your list" banner sentence
- No PPV badge
- Countdown reads as a typographic stat, not a boxed widget
- Search input and filter chips are flat-filled, no borders

- [ ] **Step 3: Toggle to light mode and repeat the check**

Click the sun/moon icon in the header. Re-check the same list — contrast should hold (card visibly lighter/darker than page background; text legible; gold text readable on white).

- [ ] **Step 4: Test interactions**

- Type into search — list filters live.
- Tap a filter chip — list filters by favorite/interested.
- Tap the headline card's "View full comparison" — modal opens with real stats; close it.
- Tap a compact row — modal opens for that fight.
- Tap an event header — that event's fight list collapses/expands.

- [ ] **Step 5: Check the console and network tab for errors**

Use `read_console_messages` (onlyErrors) and confirm no new errors introduced by this change (pre-existing unrelated warnings are out of scope).

- [ ] **Step 6: Take a screenshot for the record**

Screenshot the page in dark mode at mobile width as confirmation the implementation matches the approved mockup.

- [ ] **Step 7: If anything doesn't match the spec, fix it and re-verify**

Any fix here is a small, targeted edit to `UpcomingFights.js` or `UpcomingFights.module.css` — re-run Step 2-6 after each fix. Commit each fix separately with a `fix:` commit message.

---

## Explicitly not covered by this plan

- NavBar / logo — untouched
- Desktop layout for this page
- Any other page (Events, Rankings, Stats, Search, Favorites, Picks)
- The main-card-time-shows-early-prelims-time data bug noticed during design review
