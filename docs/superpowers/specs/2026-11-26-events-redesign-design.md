# Events page redesign — design spec

## Problem

The current Events page (`Events.js`, `EventCard.js`, `FightCard.js`, `BettingCard.js`) has the same "basic AI design" problems the original UI-overhaul spec identified and already fixed on Upcoming Fights: emoji as UI content (🥊 page header, 🏆/👑 badges, flag emoji), circular avatars instead of portrait blocks, weak structural hierarchy. On top of the visual issues, the interaction model itself needed rethinking, not just restyling.

Events is a different page than Upcoming Fights, not a reskin of it: Upcoming Fights only ever shows fights involving a favorited fighter. Events shows **every** fight on **every** card, and its real job is as a live-event companion — "when I watch an event and I pull this up and look at some of the fighters and stats before they fight or during their fight" (Jared's own description). That means more fights to browse per event, and a heavier emphasis on per-fighter stat lookup than Upcoming Fights needs.

`BettingCard.js` is also misleadingly named: it has never shown betting odds. `upcoming_fights` has no odds columns at all — `betting_odds`/`betting_status`/`pick_percentage` only exist on historical `fight_history` rows (see `.claude/skills/ufc-database/references/db-schema.md`). The redesign keeps that reality rather than pretending otherwise.

## Approach

**List + detail**, the same pattern already proven and approved for Upcoming Fights desktop (`2026-08-16-upcoming-fights-desktop-design.md`) — reused here rather than invented fresh, since it already solves "browse a list, then go deep on one item" for this app. Mobile collapses to a drill-down (list → event page → fight detail), the same relationship Upcoming Fights' mobile/desktop already have.

Three directions were mocked up with real Supabase data (UFC 335 card) and iterated with Jared:

- **A — Restyle in place.** Same structure as today: list, tap an event to expand it inline, segmented card-section control, tap a fight to expand its comparison inline. Kept as the closest point of comparison to today's app, but rejected as the primary direction — expanding everything inline on a single scrolling list doesn't scale well once an event has 10+ fights, which the current app's `groupFightsBySection` logic already has to handle.
- **B — Flattened drill-down.** List → dedicated event page → inline fight comparison on that page. Fewer nested expand states than A. This is the mobile shape, regardless of which top-level direction wins, since mobile has no room for a side-by-side list+detail.
- **C — List + detail pane (desktop) — chosen.** Event list in a left sidebar, full event detail (segmented control, fight list, expandable comparison) in a right-hand pane — no navigation, no accordion. This round's work (per explicit sequencing from Jared: focus desktop first, adapt mobile after) only pixel-specs this direction. Mobile's shape is B, reusing the same comparison/detail content reflowed to one column, but its exact layout is **not** finalized here — see "Explicitly out of scope."

**Default state — no auto-expand.** Unlike Upcoming Fights (which auto-selects the soonest event's headline fight), Events loads with nothing pre-selected: the list is fully collapsed, and the detail pane prompts to pick an event. This is intentional, not an oversight — Jared explicitly asked for this ("no need for that, doing too much and sometimes there's errors with the fights"). Events is a browse-first reference tool, not a "what's next" reminder, so there's no single fight that deserves to be pre-opened the way "the soonest fight" does on Upcoming Fights.

**Any fight row is clickable, not just the headline.** Selecting an event shows its full fight list; clicking any individual fight row (not only whichever one gets headline treatment) swaps the detail pane's comparison block to that fight. This preserves what the old `FightCard`/`BettingCard` pattern already did (every fight was expandable) — the redesign changes how the comparison looks and where it lives, not which fights you can look up.

## Breakpoint

Same `min-width: 860px` breakpoint already established for Upcoming Fights desktop. Below it, the page uses Direction B's drill-down shape (list → event page → fight detail) — see "Explicitly out of scope" for why that shape isn't pixel-specified in this pass.

## Layout — Desktop (in scope this round)

**Left sidebar:**
- Page title ("Events"), count subtitle (e.g. "12 events").
- Scrollable list of events, nearest-first, each row: date chip (day + month, same component as Upcoming Fights), event name, venue/location, fight count. A `PPV` tag renders next to the event name for PPV events (text tag, not a decorative badge — no separate colored badge treatment).
- Clicking a row loads that event into the right pane and highlights the row (`outline`, not a colored left-border, per design principle #1).

**Right detail pane:**
1. Event header: full event name (+ PPV tag if applicable), date/time, venue, fight count — icons from lucide-react (Calendar, MapPin, Users), no emoji.
2. Segmented control: **Main Card / Prelims / Early Prelims**, matching the three buckets `groupFightsBySection` already produces (`card_section` values are `Main Event`, `Co-Main`, `Main Card`, `Prelim`, `Early Prelims` per the schema; Main Event/Co-Main fold into the Main Card bucket like today).
3. The selected fight's full comparison block (see below), shown wherever the user last clicked — nothing selected by default (see "Default state" above).
4. Remaining fights in the active section, as compact single-line rows (small avatar, names, section tag) below the comparison — clicking one swaps the comparison block to that fight.

**Comparison block** (replaces the old 4-page `BettingCard` carousel with one stacked view — no pagination):
- Two fighter columns: portrait block, name (Bebas Neue) with an inline star for favorite/interested status (not a banner), nickname, record + flag + age, and rank. Rank shows a bare number (`#3`) when the fighter's ranked division matches this fight's own division; otherwise it appends the division abbreviation (e.g. `#2 FW`) — avoids listing an irrelevant higher-profile division ranking as if it applied to this fight.
- **Bio**: height, reach.
- **Striking**: landed/min, absorbed/min, defense, accuracy, knockdown avg.
- **Grappling**: takedown avg/15, takedown defense, takedown accuracy, submission avg/15.
- **Finish rate**, with an **All / Wins / Losses toggle** (restores the old `BettingCard` behavior) that switches all three KO-TKO/Submission/Decision rows between a fighter's combined career rate, win-only breakdown, and loss-only breakdown. A fight-count line sits directly above the three rows and updates with the toggle (e.g. "35 fights" → "24 wins" → "11 losses") so the percentage is never shown without its denominator.
- **Last 3 fights**: opponent name + method + date per fighter (not bare W/L chips — the old carousel's "Fight History" page always showed this much detail, and it should not be lost here).
- **"Full fight breakdown"** link into the new deeper view below.

**Fight breakdown (new deeper view, reached per-fight via the link above):**
- **Strike placement — position**: standing / clinch / ground, as a simple bar per fighter, from `fighters.sig_strikes_by_position`.
- **Strike placement — target**: head / body / leg, shown as a body-silhouette diagram (flat-colored base shape, per-region fill opacity scaled to that region's share of total strikes — darker region = higher concentration) with a count + % list beside it, from `fighters.sig_strikes_by_target`. Styled after the reference UFC.com graphic Jared pointed to, but drawn with this app's own flat, no-gradient silhouette and the existing gold/blue tokens instead of UFC's red.
- **Last 5 fights** per fighter (vs. 3 in the quick comparison) — same opponent/method/date format.
- This is new functionality, not a restyle of something that existed before: `sig_strikes_by_position`/`sig_strikes_by_target` are populated in Supabase today but never rendered anywhere in the current app.

**Flags.** Real SVG flag icons, not emoji and not the plain-text 3-letter codes the original 2026-08-15 spec specified for Upcoming Fights. That earlier decision was driven by flag emoji not rendering on Windows (Jared's dev machine) — a real SVG icon set sidesteps that failure mode entirely since it doesn't depend on the OS emoji font, so there's no longer a reason to fall back to text codes here. Needs a small icon library (e.g. `flag-icons`) plus a country-name → ISO-code lookup, since `fighters.country` stores a full name ("Brazil"), not a code.

## Visual language

No new tokens or principles beyond the existing design system (`2026-08-15-ui-overhaul-upcoming-fights-design.md`, "Design principles" section): flat solid fills, no decorative borders/gradients/glow, no emoji, Bebas Neue reserved for fighter names (plus the page H1), gold for objective/champion status only, portrait blocks not circular avatars, structural hierarchy (scale/spacing/surface tiering) over decorative hierarchy. Section headers inside the comparison block (Striking, Grappling, Finish rate, Last fights, etc.) are center-aligned within the comparison card — this is specific to the comparison block's own symmetric two-column layout, not a general change to how the rest of the app aligns text; list rows (events list, fight rows, fight history, the target breakdown's region/count/% lines) stay left-aligned, since centering list data makes it harder to scan.

Championship fights use the lucide-react `Crown` icon + gold name/badge treatment (replacing the old 👑 emoji), consistent with how Upcoming Fights already marks champions.

## Data notes surfaced during mockup work

- **Real bug found**: `fighters.ufc_losses_dec` (and likely `ufc_losses_ko`/`ufc_losses_sub`) is stale for at least Diego Lopes — reads `0/0/0` despite his 3 UFC losses all being decisions per `fight_history`. The All/Wins/Losses toggle should be built against `fight_history`-derived counts (or the `fighters` columns should be fixed/re-verified first), not trusted blindly from the `fighters` table's loss-breakdown columns. Fixing the underlying scraper/upload data is separate from this redesign — see out of scope.
- Confirmed (not new, but worth restating for the plan): no live betting odds exist for `upcoming_fights` in the schema. Don't reintroduce anything implying odds exist.

## Explicitly out of scope

- **Full mobile layout.** Direction B (list → event page → inline fight comparison) is the agreed *shape* for mobile, but it is not pixel-specified in this pass — per Jared's explicit request this round, desktop is being finished first and mobile adapted afterward, rather than designing both in lockstep like the original Upcoming Fights pass did. A follow-up spec (or an addendum to this one) covers mobile's exact layout before implementation reaches it.
- **Fixing the `ufc_losses_dec` (etc.) data bug itself** — a scraper/upload task, not a UI change.
- **Any standalone "matchup compare" tool** — a separate, unspecced idea (per project memory) distinct from this page.
- **Keyboard navigation / accessibility specifics** for the list+detail selection pattern — same deferral as the Upcoming Fights desktop spec; the implementation plan should specify reasonable defaults.
- **Live countdown, search bar, favorite/interested filter chips** — these are Upcoming-Fights-specific (it's a favorites-filtered view); Events shows everything, so they don't apply here.
- **PPV/championship visual treatment beyond a text tag + Crown icon** — no further exploration of e.g. a distinct PPV page theme.

## Reference

Mockup iteration (same Artifact URL across all rounds, current version is the final reviewed state): `https://claude.ai/artifact/AsBsDLNidAhB6vZZsCpuGP` — Option C is the approved desktop direction; the "Fight breakdown" section (labeled D) is the new deeper per-fight view; Options A/B remain in the mockup as the reference point for mobile's drill-down shape only.
