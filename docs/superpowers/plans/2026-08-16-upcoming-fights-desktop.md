# Upcoming Fights desktop layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real desktop layout for the Upcoming Fights page — a list+detail split (event list on the left, selected fight's full detail on the right) with a live-ticking countdown — replacing the three interim CSS-only patches, while leaving the mobile layout completely untouched.

**Architecture:** Two new hooks (`useMediaQuery` for the breakpoint switch, `useCountdown` wrapping a pure, tested time-math function) drive a new desktop-only component tree (`UpcomingFightsDesktopComponents.js`) that the page renders instead of the mobile tree when the viewport is wide enough. The desktop tree reuses the existing `FighterColumn` component (newly exported) and several existing CSS classes (`.matchup`, `.vsColumn`, `.fightResult`, `.compareLink`, `.searchBar`, `.filterChips`) so the two layouts stay visually consistent without duplicating logic.

**Tech Stack:** React 18 (CRA), CSS Modules, lucide-react icons, Jest (existing test setup).

**Decisions made during planning (the desktop spec left these as open questions — resolved here):**
- The spec didn't say where the theme toggle and Favorites/Interested filter chips go on desktop (the mockups omitted them for clarity). Placement: theme toggle next to the sidebar title, filter chips just below the search bar — same components, same behavior as mobile, just relocated into the sidebar.
- Default fight selection on load, and re-selection when the current selection gets filtered out, both need concrete logic — spec'd in Task 6.
- "Don't double-count fights" turned out to already be correct in the data model: `eventData.fights` is one entry per fight regardless of how many of its fighters are followed, so `eventData.fights.length` is already a fight-level count. The double-counting only ever existed in a static mockup number that wasn't actually computed — no code bug to fix, just don't introduce one.

---

## Task 1: Pure countdown math and fight-date formatting

**Files:**
- Modify: `ufc-tracker/src/utils/upcomingFightsHelpers.js`
- Test: `ufc-tracker/src/utils/upcomingFightsHelpers.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `ufc-tracker/src/utils/upcomingFightsHelpers.test.js` (append these `describe` blocks after the existing ones, keep the existing `import` line but add the two new names to it):

```js
import { getFightPriorityScore, selectHeadlineFight, getDateParts, computeCountdownParts, formatFightDate } from './upcomingFightsHelpers';
```

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ufc-tracker && CI=true npx react-scripts test src/utils/upcomingFightsHelpers.test.js`
Expected: FAIL — `computeCountdownParts` and `formatFightDate` are not exported.

- [ ] **Step 3: Add the two functions**

Add to the end of `ufc-tracker/src/utils/upcomingFightsHelpers.js`:

```js
/**
 * Splits a millisecond countdown into days/hours/minutes/seconds. Pure
 * function (no Date.now() inside) so it's trivially testable — the
 * useCountdown hook supplies "now" from the caller.
 */
export const computeCountdownParts = (targetMs, nowMs) => {
  const diff = targetMs - nowMs;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    isPast: false,
  };
};

/**
 * Formats a fight_history entry's "YYYY-MM-DD" date as "Mon 'YY" for the
 * recent-fights list. Appends T00:00:00 so it parses in local time
 * instead of UTC (same off-by-one-day guard as getDateParts).
 */
export const formatFightDate = (dateString) => {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00`);
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `${month} '${year}`;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ufc-tracker && CI=true npx react-scripts test src/utils/upcomingFightsHelpers.test.js`
Expected: PASS (15 tests: the 10 from the mobile plan + 5 new).

- [ ] **Step 5: Commit**

```bash
git add ufc-tracker/src/utils/upcomingFightsHelpers.js ufc-tracker/src/utils/upcomingFightsHelpers.test.js
git commit -m "feat: add countdown math and fight-date formatting helpers"
```

---

## Task 2: `useMediaQuery` hook

**Files:**
- Create: `ufc-tracker/src/hooks/useMediaQuery.js`

No test for this one — it's a thin wrapper around `window.matchMedia`, a browser API `jsdom` (the test environment) doesn't meaningfully implement, so a mocked test would just assert the mock's behavior rather than anything real. It's verified in Task 7 by actually resizing the browser.

- [ ] **Step 1: Create the hook**

```js
import { useState, useEffect } from 'react';

export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (event) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
};
```

- [ ] **Step 2: Verify the app still compiles**

Run: `cd ufc-tracker && CI=true npx react-scripts build`
Expected: succeeds (this file isn't imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add ufc-tracker/src/hooks/useMediaQuery.js
git commit -m "feat: add useMediaQuery hook for the desktop breakpoint switch"
```

---

## Task 3: `useCountdown` hook

**Files:**
- Create: `ufc-tracker/src/hooks/useCountdown.js`

No test for this one either — it's a thin `setInterval` wrapper around `computeCountdownParts`, which already has full test coverage from Task 1. Verified live in Task 7 (the whole point is watching it actually tick).

- [ ] **Step 1: Create the hook**

```js
import { useState, useEffect } from 'react';
import { computeCountdownParts } from '../utils/upcomingFightsHelpers';

export const useCountdown = (targetDate) => {
  const targetMs = targetDate ? targetDate.getTime() : null;
  const [parts, setParts] = useState(() => (targetMs ? computeCountdownParts(targetMs, Date.now()) : null));

  useEffect(() => {
    if (!targetMs) {
      setParts(null);
      return undefined;
    }
    setParts(computeCountdownParts(targetMs, Date.now()));
    const interval = setInterval(() => {
      setParts(computeCountdownParts(targetMs, Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetMs]);

  return parts;
};
```

- [ ] **Step 2: Verify the app still compiles**

Run: `cd ufc-tracker && CI=true npx react-scripts build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add ufc-tracker/src/hooks/useCountdown.js
git commit -m "feat: add useCountdown hook wrapping the tested countdown math"
```

---

## Task 4: Desktop CSS

**Files:**
- Modify: `ufc-tracker/src/styles/UpcomingFights.module.css`

- [ ] **Step 1: Replace the interim desktop media query block**

Find this block (it's the last thing in the file, added by the three interim patches):

```css
/* Wider viewports: stop the page from collapsing into a narrow column
   surrounded by dead space, without sacrificing the thing this page is
   for -- scanning top-to-bottom to see what's next in chronological
   order. Stays single-column (a two-column masonry layout was tried
   and broke that ordering: later events ended up level with sooner
   ones). Instead it widens the reading column and gives everything
   more room -- bigger date chips, bigger portraits -- since desktop
   is the "deeper analysis" use case. Still a stopgap, not the
   dedicated desktop design pass. */
@media (min-width: 860px) {
  .content { max-width: 900px; padding: 2.5rem 2rem 3rem; }
  .eventsContainer { gap: 1.5rem; }
  .pageTitle { font-size: 2.6rem; }
  .countdownNumber { font-size: 1.8rem; }
  .dateChip { width: 60px; padding: 0.6rem 0; }
  .dateChipDay { font-size: 1.7rem; }
  .dateChipMonth { font-size: 0.7rem; }
  .eventName { font-size: 1.1rem; }
  .eventHeader { padding: 1.25rem 1.5rem; }
  .eventBody { padding: 0.85rem 1.5rem 0.3rem; }
  .portrait { height: 200px; }
  .fighterName { font-size: 1.7rem; }
  .fighterMeta { font-size: 0.82rem; }
  .compactRowName { font-size: 1rem; }
  .compactRowAvatar { width: 34px; height: 34px; border-radius: 17px; }
}
```

Replace the whole block (comment included) with:

```css
/* Desktop layout (>= 860px): a real list+detail split, rendered as a
   separate component tree by the page (see useMediaQuery), not a CSS
   reflow of the mobile markup. Reuses several mobile classes directly
   (.matchup, .vsColumn, .vsMark, .fightResult, .compareLink,
   .searchBar, .filterChips) so the two layouts share one visual
   language; only genuinely desktop-only pieces get new classes. */

.desktopWrap {
  display: flex;
  align-items: flex-start;
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  gap: 2rem;
}

.desktopSidebar {
  width: 410px;
  flex-shrink: 0;
  position: sticky;
  top: 2rem;
  max-height: calc(100vh - 4rem);
  overflow-y: auto;
}

.desktopSidebarTop {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.4rem;
}

.desktopSidebarTitle {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.8rem;
  letter-spacing: 0.4px;
  line-height: 1;
}

.desktopCount {
  font-size: 0.78rem;
  color: var(--mute);
  margin-bottom: 0.9rem;
}

.desktopCountdown { margin-bottom: 1.1rem; }

.desktopCountdownRow {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
}

.desktopCountdownDays {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 3.2rem;
  color: var(--accent);
  line-height: 1;
}

.desktopCountdownHms {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.2rem;
  color: var(--mute);
}

.desktopCountdownCaption {
  font-size: 0.76rem;
  color: var(--mute);
  margin-top: 0.3rem;
}

.desktopFilterChips { margin-bottom: 0.5rem; }

.desktopEventGroup { border-top: 1px solid var(--line); }
.desktopEventGroup:first-child { border-top: none; }

.desktopEventHead { padding: 0.9rem 0 0.5rem; }

.desktopEventName {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text);
  line-height: 1.3;
}

.desktopEventMeta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.3rem;
}

.desktopEventWhen { font-size: 0.7rem; color: var(--mute); }

.desktopEventCount {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--mute);
}

.desktopEventCountBusy { color: var(--gold); }

.desktopFightRow {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.5rem;
  border-radius: 8px;
  background: none;
  border: none;
  width: 100%;
  cursor: pointer;
  text-align: left;
}

.desktopFightRowSelected { background: var(--card); }

.desktopFightRowAvatar {
  width: 30px;
  height: 30px;
  border-radius: 15px;
  background: var(--portrait);
  object-fit: cover;
  flex-shrink: 0;
}

.desktopFightRowName {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.3px;
  color: var(--text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktopFightRowName .vsWord { color: var(--mute); font-family: inherit; }

.desktopDetail { flex: 1; min-width: 0; }

.desktopDetailContext { font-size: 0.8rem; color: var(--mute); margin-bottom: 1.5rem; }

.desktopMatchup .portrait { height: 190px; }
.desktopMatchup .fighterName { font-size: 1.7rem; }
.desktopMatchup .fighterMeta { font-size: 0.8rem; }
.desktopMatchup .matchup { gap: 3rem; margin-bottom: 1.5rem; }

.desktopStatStrip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  padding: 1rem 0;
  border-top: 1px solid var(--line);
  max-width: 600px;
  margin: 0 auto;
}

.desktopStatItem { text-align: center; }
.desktopStatLabel { font-size: 0.66rem; color: var(--mute); }
.desktopStatValue { font-size: 0.88rem; margin-top: 0.25rem; }
.desktopStatSep { color: var(--mute); margin: 0 0.3rem; }

.desktopHistoryGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  padding: 1.25rem 0 0.5rem;
  border-top: 1px solid var(--line);
  max-width: 600px;
  margin: 0.25rem auto 0;
}

.desktopHistoryLabel { font-size: 0.7rem; color: var(--mute); margin-bottom: 0.5rem; }

.fightDate { font-size: 0.72rem; color: var(--mute); margin-left: 0.4rem; }

@media (max-width: 859px) {
  .desktopWrap, .desktopSidebar, .desktopDetail { display: none; }
}
```

Note the `.desktopMatchup .matchup` / `.fightResult` / `.compareLink` reuse: `.matchup`, `.vsColumn`, `.vsMark`, `.fightResult`, `.resultIndicator`, `.win`, `.loss`, `.method`, `.noFights`, `.compareLink`, `.better`, `.searchBar`, `.filterChips`, `.chip`, `.chipOn` all already exist from the mobile CSS — don't redefine them, Task 5's components import them via the same `styles` object.

- [ ] **Step 2: Commit**

```bash
git add ufc-tracker/src/styles/UpcomingFights.module.css
git commit -m "feat: replace interim desktop CSS with the real list+detail layout styles"
```

This will not visually apply to anything yet — no component uses these classes until Task 5/6. That's expected.

---

## Task 5: Desktop components

**Files:**
- Modify: `ufc-tracker/src/components/UpcomingFightsComponents.js` (export `FighterColumn`)
- Create: `ufc-tracker/src/components/UpcomingFightsDesktopComponents.js`

- [ ] **Step 1: Export `FighterColumn`**

In `ufc-tracker/src/components/UpcomingFightsComponents.js`, find this line:

```js
const FighterColumn = ({ fighter, favorites, rankInfo, formatRecord }) => {
```

Change it to:

```js
export const FighterColumn = ({ fighter, favorites, rankInfo, formatRecord }) => {
```

That's the only change to this file — everything else in it (`DateChip`, `HeadlineFightCard`, `CompactFightRow`) stays exactly as it is, still used by mobile.

- [ ] **Step 2: Create the desktop components file**

```jsx
import React from 'react';
import { Star, Flame, ChevronRight } from 'lucide-react';
import styles from '../styles/UpcomingFights.module.css';
import { formatFightDate } from '../utils/upcomingFightsHelpers';
import { useCountdown } from '../hooks/useCountdown';
import { FighterColumn } from './UpcomingFightsComponents';

export const CountdownDisplay = ({ targetDate, eventName }) => {
  const parts = useCountdown(targetDate);
  if (!parts) return null;

  return (
    <div className={styles.desktopCountdown}>
      <div className={styles.desktopCountdownRow}>
        <span className={styles.desktopCountdownDays}>
          {parts.isPast ? 'Fight time' : `${parts.days}d`}
        </span>
        {!parts.isPast && (
          <span className={styles.desktopCountdownHms}>
            {String(parts.hours).padStart(2, '0')}h {String(parts.minutes).padStart(2, '0')}m {String(parts.seconds).padStart(2, '0')}s
          </span>
        )}
      </div>
      {!parts.isPast && <div className={styles.desktopCountdownCaption}>until {eventName}</div>}
    </div>
  );
};

const starColor = (favorites) => {
  if (!favorites || favorites.length === 0) return null;
  if (favorites.some((f) => f.priority === 'favorite')) return 'var(--gold)';
  if (favorites.some((f) => f.priority === 'interested')) return 'var(--accent)';
  return null;
};

const DesktopFightRow = ({ fight, isSelected, onSelect }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;
  const f1Color = starColor(fight.fighter1_favorites);
  const f2Color = starColor(fight.fighter2_favorites);

  return (
    <button
      className={`${styles.desktopFightRow} ${isSelected ? styles.desktopFightRowSelected : ''}`}
      onClick={onSelect}
    >
      <img
        className={styles.desktopFightRowAvatar}
        src={f1.image_url || '/static/images/placeholder.jpg'}
        alt=""
        onError={(e) => { e.target.src = `https://via.placeholder.com/60x60/1a2338/f5f7fa?text=${f1.name?.charAt(0) || '?'}`; }}
      />
      <span className={styles.desktopFightRowName}>
        {f1.name}
        {f1Color && <Star className={styles.followedStar} style={{ color: f1Color }} size={11} aria-label="On your list" />}
        {' '}<span className={styles.vsWord}>vs</span>{' '}
        {f2.name}
        {f2Color && <Star className={styles.followedStar} style={{ color: f2Color }} size={11} aria-label="On your list" />}
      </span>
      <ChevronRight className={styles.compactRowChevron} size={14} aria-hidden="true" />
    </button>
  );
};

export const EventListGroup = ({ eventName, eventData, dayLabel, selectedFightId, onSelectFight }) => {
  const count = eventData.fights.length;
  const isBusy = count >= 3;

  return (
    <div className={styles.desktopEventGroup}>
      <div className={styles.desktopEventHead}>
        <div className={styles.desktopEventName}>{eventName}</div>
        <div className={styles.desktopEventMeta}>
          <span className={styles.desktopEventWhen}>{dayLabel}</span>
          <span className={`${styles.desktopEventCount} ${isBusy ? styles.desktopEventCountBusy : ''}`}>
            {isBusy && <Flame size={13} aria-hidden="true" />}
            {count} fight{count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      {eventData.fights.map((fight) => (
        <DesktopFightRow
          key={fight.id}
          fight={fight}
          isSelected={fight.id === selectedFightId}
          onSelect={() => onSelectFight(fight.id)}
        />
      ))}
    </div>
  );
};

const betterValue = (a, b) => {
  const av = parseFloat(a) || 0;
  const bv = parseFloat(b) || 0;
  return { aBetter: av > bv, bBetter: bv > av };
};

export const FightDetailPane = ({ fight, eventName, eventWhen, f1Rank, f2Rank, formatRecord, formatStat, getRecentFights, onOpenFullComparison }) => {
  const f1 = fight.fighter1_data;
  const f2 = fight.fighter2_data;
  if (!f1 || !f2) return null;

  const stats = [
    { label: 'Reach', f1: f1.reach ? `${f1.reach}"` : 'N/A', f2: f2.reach ? `${f2.reach}"` : 'N/A' },
    { label: 'Strikes/min', f1: formatStat(f1.strikes_landed_per_min), f2: formatStat(f2.strikes_landed_per_min) },
    { label: 'TD/15min', f1: formatStat(f1.takedown_avg, 1), f2: formatStat(f2.takedown_avg, 1) },
    { label: 'Str. defense', f1: formatStat(f1.striking_defense), f2: formatStat(f2.striking_defense) },
  ];

  const recentF1 = getRecentFights(f1);
  const recentF2 = getRecentFights(f2);

  return (
    <div className={styles.desktopDetail}>
      <div className={styles.desktopDetailContext}>{eventName} &middot; {eventWhen}</div>

      <div className={styles.desktopMatchup}>
        <div className={styles.matchup}>
          <FighterColumn fighter={f1} favorites={fight.fighter1_favorites} rankInfo={f1Rank} formatRecord={formatRecord} />
          <div className={styles.vsColumn}><span className={styles.vsMark}>VS</span></div>
          <FighterColumn fighter={f2} favorites={fight.fighter2_favorites} rankInfo={f2Rank} formatRecord={formatRecord} />
        </div>
      </div>

      <div className={styles.desktopStatStrip}>
        {stats.map((stat, idx) => {
          const { aBetter, bBetter } = betterValue(stat.f1, stat.f2);
          return (
            <div key={idx} className={styles.desktopStatItem}>
              <div className={styles.desktopStatLabel}>{stat.label}</div>
              <div className={styles.desktopStatValue}>
                <span className={aBetter ? styles.better : ''}>{stat.f1}</span>
                <span className={styles.desktopStatSep}>&middot;</span>
                <span className={bBetter ? styles.better : ''}>{stat.f2}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.desktopHistoryGrid}>
        {[{ fighter: f1, fights: recentF1 }, { fighter: f2, fights: recentF2 }].map(({ fighter, fights }, idx) => (
          <div key={idx}>
            <div className={styles.desktopHistoryLabel}>{fighter.name}, last 3</div>
            {fights.map((f, i) => (
              <div key={i} className={`${styles.fightResult} ${styles[f.result?.toLowerCase() || '']}`}>
                <span className={styles.resultIndicator}>{f.result?.charAt(0)?.toUpperCase() || '?'}</span>
                <span>{f.opponent || 'Unknown'}</span>
                <span className={styles.method}>{f.method?.replace(/\([^)]*\)/g, '').trim() || 'N/A'}</span>
                <span className={styles.fightDate}>{formatFightDate(f.fight_date)}</span>
              </div>
            ))}
            {fights.length === 0 && <div className={styles.noFights}>No recent fights</div>}
          </div>
        ))}
      </div>

      <button className={styles.compareLink} onClick={() => onOpenFullComparison(fight)}>
        Full stat breakdown &rarr;
      </button>
    </div>
  );
};
```

- [ ] **Step 3: Verify the app still compiles**

Run: `cd ufc-tracker && CI=true npx react-scripts build`
Expected: succeeds (these components aren't imported into the page yet).

- [ ] **Step 4: Commit**

```bash
git add ufc-tracker/src/components/UpcomingFightsComponents.js ufc-tracker/src/components/UpcomingFightsDesktopComponents.js
git commit -m "feat: add desktop list+detail components (CountdownDisplay, EventListGroup, FightDetailPane)"
```

---

## Task 6: Wire desktop rendering into the page

**Files:**
- Modify: `ufc-tracker/src/pages/UpcomingFights.js`

- [ ] **Step 1: Update imports**

Replace the existing import block at the top of the file with:

```jsx
import React, { useEffect, useState, useMemo } from 'react';
import { Search, X, AlertCircle, ChevronDown, ChevronUp, Sun, Moon } from 'lucide-react';
import supabase from '../api/supabaseClient';
import { getFullUpcomingFights } from '../api/supabaseQueries';
import { getFightPriorityScore, selectHeadlineFight, getDateParts } from '../utils/upcomingFightsHelpers';
import { DateChip, HeadlineFightCard, CompactFightRow } from '../components/UpcomingFightsComponents';
import { CountdownDisplay, EventListGroup, FightDetailPane } from '../components/UpcomingFightsDesktopComponents';
import { useMediaQuery } from '../hooks/useMediaQuery';
import styles from '../styles/UpcomingFights.module.css';
```

- [ ] **Step 2: Add desktop state and derived data**

Inside the `UpcomingFights` component, right after the existing `const [darkMode, setDarkMode] = useState(true);` line, add:

```jsx
  const [selectedFightId, setSelectedFightId] = useState(null);
  const isDesktop = useMediaQuery('(min-width: 860px)');
```

- [ ] **Step 3: Hoist the sorted-events computation and add selection logic**

Find this line inside the `groupedFights` `useMemo` block's return, i.e. right after the `groupedFights` `useMemo` closes (after the `}, [filteredFights]);` line), and add a new `useMemo` for the sorted entries plus the selection-management logic:

```jsx
  const sortedEventEntries = useMemo(
    () => Object.entries(groupedFights).sort(([, a], [, b]) => new Date(a.date) - new Date(b.date)),
    [groupedFights]
  );

  const defaultDesktopFight = useMemo(() => {
    if (sortedEventEntries.length === 0) return null;
    const [, firstEventData] = sortedEventEntries[0];
    return selectHeadlineFight(firstEventData.fights) || firstEventData.fights[0] || null;
  }, [sortedEventEntries]);

  useEffect(() => {
    const stillPresent = filteredFights.some((f) => f.id === selectedFightId);
    if (!stillPresent) {
      setSelectedFightId(defaultDesktopFight ? defaultDesktopFight.id : null);
    }
  }, [filteredFights, defaultDesktopFight, selectedFightId]);

  const selectedFight = useMemo(
    () => filteredFights.find((f) => f.id === selectedFightId) || null,
    [filteredFights, selectedFightId]
  );
```

This replaces the ad-hoc `Object.entries(groupedFights).sort(...)` that used to be written inline in the mobile render (Step 6 below switches the mobile render to use `sortedEventEntries` too, so the sort logic exists in exactly one place).

- [ ] **Step 4: Add the mixed-case month helper**

Right after `getCardSectionInfo`, add:

```jsx
  const toMixedCaseMonth = (month) => month.charAt(0) + month.slice(1).toLowerCase();
```

- [ ] **Step 5: Compute the next-event target date and the selected fight's context line**

Replace the existing `nextEvent` `useMemo` (the one that currently returns `{ days, event }`) with a version that also exposes a real `Date` object for the countdown hook:

```jsx
  const nextEvent = useMemo(() => {
    if (fights.length === 0) return null;
    const now = new Date();
    const upcoming = fights
      .map((f) => ({ date: new Date(f.event_date + 'T' + (f.event_time || '00:00')), event: f.event }))
      .filter((f) => f.date > now)
      .sort((a, b) => a.date - b.date)[0];
    if (!upcoming) return null;
    const days = Math.max(1, Math.ceil((upcoming.date - now) / (1000 * 60 * 60 * 24)));
    return { days, event: upcoming.event, date: upcoming.date };
  }, [fights]);
```

(Only change: the returned object now also carries `date: upcoming.date`, used by `CountdownDisplay` on desktop. Mobile's existing `{nextEvent.days} day{s}` rendering is unaffected — it still reads `.days` and `.event` exactly as before.)

Then, right after `getEventPriority` is defined (the last helper function before `ComparisonModal`), add:

```jsx
  const selectedFightWhen = useMemo(() => {
    if (!selectedFight) return null;
    const { weekday, month, day } = getDateParts(selectedFight.event_date);
    return `${weekday}, ${toMixedCaseMonth(month)} ${day} · ${formatTime(selectedFight.event_time)}`;
  }, [selectedFight]);
```

**Placement matters here.** `toMixedCaseMonth` and `formatTime` are `const` arrow functions, not hoisted function declarations — referencing one before its `const` line has executed in that render throws a temporal-dead-zone error. `useMemo`'s factory runs synchronously at the point `useMemo(...)` is called, so this block must come *after* both `toMixedCaseMonth` (added in Step 4, right after `getCardSectionInfo`) and `formatTime` (already earlier in the file) are defined. Putting it after `getEventPriority` — the last helper before `ComparisonModal` — satisfies that for every helper used here.

- [ ] **Step 6: Replace the return's JSX**

Replace everything from `return (` at the end of the component down to the final `);` before `};` (i.e. the entire JSX return block) with:

```jsx
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

  const filterChipsRow = (
    <div className={styles.filterChips}>
      {['All', 'Favorite', 'Interested'].map((option) => (
        <button
          key={option}
          className={`${styles.chip} ${priorityFilter === option ? styles.chipOn : ''}`}
          onClick={() => setPriorityFilter(option)}
        >
          {option === 'Favorite' ? 'Favorites' : option}
        </button>
      ))}
    </div>
  );

  const searchBarRow = (
    <div className={styles.searchBar}>
      <Search size={16} aria-hidden="true" />
      <input type="text" placeholder="Search fighters or events"
        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      {searchQuery && (
        <button className={styles.clearSearch} onClick={() => setSearchQuery('')} aria-label="Clear search"><X size={14} /></button>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <div className={styles.pageContainer} data-theme={theme}>
        <div className={styles.desktopWrap}>
          <div className={styles.desktopSidebar}>
            <div className={styles.desktopSidebarTop}>
              <div className={styles.desktopSidebarTitle}>Upcoming</div>
              <button className={styles.themeToggle} onClick={() => setDarkMode(!darkMode)}
                title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}>
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
            <div className={styles.desktopCount}>
              {filteredFights.length} fights &middot; {sortedEventEntries.length} events
            </div>
            {nextEvent && <CountdownDisplay targetDate={nextEvent.date} eventName={nextEvent.event} />}
            {searchBarRow}
            <div className={styles.desktopFilterChips}>{filterChipsRow}</div>

            {sortedEventEntries.length === 0 ? (
              <p className={styles.pageSub}>No upcoming fights found for your selected criteria</p>
            ) : (
              sortedEventEntries.map(([eventName, eventData]) => {
                const { month, day } = getDateParts(eventData.date);
                const dayLabel = `${toMixedCaseMonth(month)} ${day} · ${formatTime(eventData.time)}`;
                return (
                  <EventListGroup
                    key={eventName}
                    eventName={eventName}
                    eventData={eventData}
                    dayLabel={dayLabel}
                    selectedFightId={selectedFightId}
                    onSelectFight={setSelectedFightId}
                  />
                );
              })
            )}
          </div>

          {selectedFight && (
            <FightDetailPane
              fight={selectedFight}
              eventName={selectedFight.event}
              eventWhen={selectedFightWhen}
              f1Rank={getFighterRankInfo(selectedFight.fighter1_data)}
              f2Rank={getFighterRankInfo(selectedFight.fighter2_data)}
              formatRecord={formatRecord}
              formatStat={formatStat}
              getRecentFights={getRecentFights}
              onOpenFullComparison={setComparingFighters}
            />
          )}
        </div>

        {comparingFighters && <ComparisonModal fight={comparingFighters} onClose={() => setComparingFighters(null)} />}
      </div>
    );
  }

  return (
    <div className={styles.pageContainer} data-theme={theme}>
      <div className={styles.content}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Upcoming fights</h1>
            <p className={styles.pageSub}>
              {filteredFights.length} fights across {sortedEventEntries.length} events you follow
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

        {searchBarRow}
        {filterChipsRow}

        {sortedEventEntries.length === 0 ? (
          <p className={styles.pageSub}>No upcoming fights found for your selected criteria</p>
        ) : (
          <div className={styles.eventsContainer}>
            {sortedEventEntries.map(([eventName, eventData]) => {
              const { day, month, weekday } = getDateParts(eventData.date);
              const { favorites, interested } = getEventPriority(eventData.fights);
              const breakdownParts = [];
              if (favorites > 0) breakdownParts.push(`${favorites} favorite${favorites > 1 ? 's' : ''}`);
              if (interested > 0) breakdownParts.push(`${interested} interested`);
              const isExpanded = expandedEvents.has(eventName);
              const headline = selectHeadlineFight(eventData.fights);
              const otherFights = eventData.fights.filter((f) => f !== headline);

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
                      {otherFights.map((fight) => (
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

That last `};` and `export default UpcomingFights;` replace the file's original ending — don't duplicate them.

- [ ] **Step 7: Run the unit tests**

Run: `cd ufc-tracker && CI=true npx react-scripts test`
Expected: same result as before this task — the 2 relevant suites (`countryCodes.test.js`, `upcomingFightsHelpers.test.js`) fully pass; only the pre-existing, unrelated `App.test.js` fails.

- [ ] **Step 8: Verify it builds clean**

Run: `cd ufc-tracker && CI=true npx react-scripts build`
Expected: succeeds, no new unused-variable warnings (in particular, confirm nothing still references the old inline `Object.entries(groupedFights).sort(...)` pattern — it should only appear once now, inside `sortedEventEntries`).

- [ ] **Step 9: Commit**

```bash
git add ufc-tracker/src/pages/UpcomingFights.js
git commit -m "feat: render the desktop list+detail layout at >=860px, mobile unchanged below it"
```

---

## Task 7: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server and open it at desktop width**

Start the `ufc-tracker` dev server, navigate to `/upcoming`, resize the browser pane to at least 1280px wide.

- [ ] **Step 2: Check the sidebar against the spec**

- "Upcoming" title, fight/event count below it, then the countdown, then search, then filter chips, then the event list — in that order.
- Countdown: days large and `--accent`-colored, hours/minutes/seconds smaller and muted next to it, and it's actually ticking — watch it for a few seconds and confirm the seconds decrease.
- Each event group shows its **full** name (not abbreviated), date+time, and a fight count. Confirm any event with 3+ fights shows the count in gold with a flame icon, and events with fewer don't.
- Confirm the fight count matches the number of rows actually shown under that event header (this is the double-counting check from review).
- Each fight row shows a gold star next to favorited fighters and a blue star next to interested-only fighters, no star for unfollowed fighters in that fight (shouldn't happen given the favorites-only filter, but check nothing renders oddly if it does).

- [ ] **Step 3: Check the detail pane**

- Clicking a different row in the sidebar updates the detail pane and highlights the selected row.
- Loading the page selects a sensible default fight (the soonest event's clear favorite, or its first fight if there's no standout).
- Portraits, names, champion/rank labels render correctly and larger than the mobile version.
- The 4-stat tale-of-the-tape strip shows real numbers with the better value in green per stat.
- Recent-fight history shows up to 3 results per fighter with a date on each row.
- "Full stat breakdown" opens the same comparison modal used on mobile.

- [ ] **Step 4: Check search and filters still work on desktop**

Type into search and click a filter chip; confirm the sidebar list updates, and confirm the detail pane's selection resets to a sensible fight if the previously-selected one gets filtered out (rather than showing a stale/nonexistent fight).

- [ ] **Step 5: Resize back to mobile width and confirm nothing changed**

Resize below 860px. The page should look and behave exactly as it did before this plan — single column, date chips, headline/compact card split, static "N days" countdown. This is the most important check: this whole plan should be additive for desktop and invisible on mobile.

- [ ] **Step 6: Check the console and network tab for errors**

Use `read_console_messages` (onlyErrors) at both widths. No new errors beyond the pre-existing, unrelated `/static/images/placeholder.jpg` 404 noted in the mobile plan.

- [ ] **Step 7: Screenshot both**

One screenshot at desktop width, one at mobile width, as confirmation.

- [ ] **Step 8: If anything doesn't match, fix it and re-verify**

Small, targeted edits to `UpcomingFights.js`, `UpcomingFightsDesktopComponents.js`, or the CSS — re-run Steps 2-7 after each fix. Commit each fix separately with a `fix:` message.

---

## Explicitly not covered by this plan

- Any change to mobile's layout, breakpoint, or behavior.
- NavBar / logo.
- The notables/top-5-bottom-5 stats idea (logged separately in Notion).
- Any other page.
