# Upcoming Fights — desktop layout design

## Problem

The mobile redesign (see `2026-08-15-ui-overhaul-upcoming-fights-design.md`) explicitly deferred desktop. When it shipped, the interim CSS (a single column capped at 480px, later widened in two follow-up patches) read as broken on an actual desktop monitor — a narrow strip of content in a sea of empty background — not as "not designed yet." Three quick patches in production (a two-column masonry grid, then a wider single column, then a wider-still single column) each fixed one symptom but never addressed the real problem: desktop needs its own layout, not a stretched mobile layout.

This spec is the real desktop design, arrived at through mockup iteration, and it replaces all three interim patches.

**Standing practice going forward:** future redesigns of this app cover mobile and desktop together in the same brainstorming pass, not desktop as a deferred fast-follow. (See memory: `feedback_redesigns_cover_both_breakpoints`.)

## Approach

List + detail split — a compact, scrollable list of every followed fight (grouped by event) on the left, and a full detail view of whichever fight is selected on the right. Chosen over two alternatives tried first:

- **A wider single column with inline stats** — kept the mobile structure, just used more of the screen and added a tale-of-the-tape strip per card. Rejected: still felt narrow/underused even widened aggressively, and repeating full card chrome for every fight wastes space once fighter photos are large.
- **A two-up grid, paired by date** — real CSS grid (not masonry) pairing sequential events into rows so order stays correct. Better use of width than A, but loses the single clear "what's next" scan line, and card heights vary a lot with how many followed fights an event has (a busy night looks lopsided next to a quiet one).

List + detail keeps chronological scanning intact (it's a single list, top to bottom) while actually using desktop width, and it naturally absorbs an event with many followed fights — extra fights are just extra rows in that event's list section, no layout strain like the paired-grid option had.

This is the desktop counterpart to the mobile page only — same data, same design tokens, same underlying page. It does not change mobile at all.

## Breakpoint

Applies at `min-width: 860px`, the same breakpoint already established for the (now-superseded) interim desktop CSS. Below that, mobile's single-column card layout (per the mobile spec) is unchanged.

## Layout

**Left sidebar (~410px fixed width):**

1. Page title, "Upcoming" (Bebas Neue, matches mobile's page-level treatment).
2. Fight/event count subtitle, e.g. "9 fights · 5 events you follow" (same computed value as mobile's header subtitle).
3. **Live countdown** to the soonest upcoming event, ticking every second against real time, not a static "N days" like mobile:
   - Days rendered large and bold (Bebas Neue, `--accent` color, ~3rem) — the primary signal.
   - Hours/minutes/seconds rendered smaller and muted (`--mute`) next to it, tabular-nums so digits don't jitter the layout as seconds tick.
   - Caption below: "until {event name}".
   - When the countdown reaches zero, show "Fight time" in place of the days number.
4. Search bar (existing search-fighters-or-events behavior, unchanged).
5. Scrollable event list, grouped by event:
   - **Group header:** full event name at real text weight and color (not muted, not abbreviated — this was explicitly called out as needing to stand out during review), with date + time secondary/muted underneath, and a fight-count indicator on the right:
     - Plain muted text for a quiet night: "1 fight".
     - At 3+ fights, the count turns `--gold` and gets a flame icon (lucide-react's `Flame`, matching the icon library used everywhere else on this page — not an emoji, emoji were removed from this page for a reason) so busy nights are visually distinct while scrolling.
     - **Count is per fight, not per followed fighter.** If both fighters in one fight are followed (e.g. a title fight where you favorited both), that's still one fight toward the count — this was a real bug caught during review (an early mockup double-counted and showed "4 fights" for an event that only had 2-3 actual fights).
   - **Fight rows** under each group header: small circular avatar, fighter names in the condensed display font ("MAKHACHEV vs GARRY"), and a small star per followed fighter — `--gold` for favorite tier, `--accent` (blue) for interested tier. Same icon, color is the only differentiator, per the "don't overdo it" note from review.
   - Clicking a row selects it (visually indicated with a filled background) and loads it into the detail pane. Default selection on load: whichever fight `selectHeadlineFight` (already built for mobile, in `upcomingFightsHelpers.js`) picks for the soonest event; if that event has no clear headline (a tie, same as mobile's compact-rows-only case), default to that event's first fight row.

**Right detail pane (fills remaining width):**

1. Context line: full event name + date/time.
2. Fighter matchup: large portrait-style photo blocks side by side with "vs" between (same treatment as mobile's headline card, just bigger — this pane has the room). Names in the display font, favorite/interested star inline, champion gets the crown icon + gold name color, ranked-but-not-champion gets a plain "Rank N" label.
3. **Inline tale-of-the-tape strip** — 4 stats side by side (Reach, Strikes/min, Takedowns/15min, Striking defense), the better value in each pair highlighted green. Pulled from the same fighter fields the existing comparison modal already uses. This is the piece carried over from the "richer single column" direction that was well-received even though that direction as a whole wasn't: real comparison data at a glance, no click required.
4. **Recent-fight history** — last 3 results per fighter, each row: win/loss indicator, opponent name, method, and the fight date (added during review — the first pass omitted dates and that was called out as a gap).
5. A "Full stat breakdown" link/CTA at the bottom. Recommendation: this opens the same `ComparisonModal` already built for mobile (same component, same data, already has the complete stat table and full recent-fights list) rather than building a second, desktop-only comparison view — keeps one source of truth for "full comparison" behavior across breakpoints.

## Visual language

No new tokens or principles beyond what's already established for mobile (see the mobile spec's "Design principles" section — it applies here unchanged): flat solid fills, no decorative colored borders, no gradients/glow, no emoji anywhere (the flame icon is a real icon font glyph, chosen specifically to avoid reintroducing emoji), Bebas Neue reserved for fighter names/page titles/the countdown's day count, gold and blue used for meaning (champion/favorite vs. interested/accent) not decoration.

## Explicitly out of scope

- Any change to the mobile layout or its breakpoint (`max-width` rules in the mobile spec are untouched).
- The "notables" idea (fighters who rank top-5 or bottom-5 overall and within their division) — logged as a project update in Notion (UFC Coding project) so it isn't lost, but it's a separate feature, likely touching this page's event previews and the FighterStats page, not part of this layout.
- Exact keyboard navigation / accessibility behavior for the list+detail selection pattern — implementation should follow reasonable defaults (the plan will need to specify these concretely), not fully pixel-specified here.
- Whether the default-selected fight on load should be re-evaluated on live data edge cases (e.g., an event with zero followed fights, which shouldn't be able to happen given the existing favorites-only filter, but worth a defensive check in the plan).

## Reference

Mockups from design review:
- Three initial directions (richer single column / list+detail / paired grid): `https://claude.ai/code/artifact/db61af5d-7cd6-4236-a5ce-4d7953201a4d`
- Refined list+detail, final approved version with live countdown: `https://claude.ai/code/artifact/46c235c4-8a9e-4c78-8860-d26b792ed458`
