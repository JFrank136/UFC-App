# Scraper Data Reference

What each scraper actually depends on to work: the real selectors, the matching logic,
and the config-file semantics that took trial-and-error to get right. This complements
two other docs rather than duplicating them:

- **Database schema** (tables, columns, FK-naming gotchas, upload behavior per table) →
  [`.claude/skills/ufc-database/references/db-schema.md`](../../.claude/skills/ufc-database/references/db-schema.md).
  Not repeated here.
- **Pipeline shape, run commands, error-file meanings, "Adding a New Fighter" workflow,
  known transient failure modes** → [`scrapers/scrapers_guide.md`](../scrapers_guide.md).
  Not repeated here.

This file covers the part neither of those does: what the scrapers are actually reading
off the live UFC.com / Tapology HTML, and what `utils/name_fixes.py`'s dicts really mean.

---

## External data source: UFC.com

Three scrapers hit UFC.com directly, each with its own fragile surface.

### `scrape_roster.py` — the athletes list

- Fighter cards: `li.l-flex__item div.c-listing-athlete-flipcard__back`. Each card is a
  CSS flip-card; the scraper force-flips it (`classList.add('is-flipped')`) before
  reading `.c-listing-athlete__name` and the profile link (`.e-button--black[href]`).
  Reading `.text` before the flip has actually settled can return `""` — see the "blank
  fighter with a valid id" failure mode in `scrapers_guide.md`.
- Pagination: `a.button[rel='next'], .button--load-more` — a genuine "Load More" button,
  not infinite scroll. If the roster page hasn't finished hydrating when the scraper
  starts polling, this selector can come up empty and truncate the whole scrape to
  page 1 (also documented in `scrapers_guide.md`).
- Per-fighter `status` ("Active"/"Retired"/etc.) is fetched from a *second* request — the
  individual profile page (`div.c-bio__label` with text `"Status"`, then the next
  sibling `div`) — not from the listing page itself. This is why `scrape_roster.py`
  makes one HTTP request per card on top of the Selenium-driven listing scroll.
- `debug_ufc_page.html` is written on every full scrape (`driver.page_source` at the
  point all cards are loaded) — the fastest way to check whether a given run's
  "Loaded N fighter cards" count reflects a real short roster or a truncated load:
  grep it for `button--load-more` and `c-listing-athlete-flipcard__back` counts.

### `scrape_details.py` — per-fighter stats and image

Plain `requests` + BeautifulSoup, no Selenium (rate-limited via `SessionManager`: max
20 req/min, 0.5s min delay between requests). The stat extraction is **three cascading
fallback methods**, tried in order, because UFC.com's stat-block markup isn't
consistent across all fighter pages:

1. **Structured** (`extract_stats_by_structure`): `.c-stat-compare__group` blocks, each
   with a `.c-stat-compare__number` + `.c-stat-compare__label`, matched by label text
   (`"sig. str. landed"`, `"takedown avg"`, etc.).
2. **Label-search fallback** (`extract_stat_by_label`): if method 1 returns nothing,
   regex-search the label text directly in the page and grab the next number.
3. **Positional fallback**: if both above fail, grab `.c-stat-3bar__value` /
   `.c-stat-compare__number` elements *by index* (0=sig strikes landed, 1=absorbed,
   2=takedown avg, 3=submission avg, 4=defense, 5=knockdown avg) — brittle, but a last
   resort. `clean_stat_value()` / `clean_stats_group()` null out values that look like
   scraped help text ("Defense is...", "Average number...") rather than real stats —
   UFC.com's markup sometimes puts the tooltip copy in the same place the number
   should be.
- Strikes-by-target (head/body/leg) are read from an **SVG body diagram**
  (`svg.c-stat-body__svg`, `text[id*='head_value']` etc.) — this is the single most
  fragile extraction in the file; if UFC.com changes the diagram's SVG structure, this
  silently returns `{}` rather than raising.
- Image selectors cascade through `img.hero-profile__image` → `img[class*='hero-profile']`
  → `img[class*='athlete_bio_full_body']` → a handful of backup selectors. Any URL not
  containing `ufc.com` is rejected as bad data. Downloaded to
  `ufc-tracker/public/images/<slug>.jpg` — **relative to the scraper's own working
  directory** (`../ufc-tracker/public/images`), so this only works when run from
  `scrapers/`.
- Gender is inferred, not scraped as a field: defaults to `"Male"`, flipped to
  `"Female"` if the word "women" appears anywhere on the page or in the bio's
  "Weight class" value. No explicit gender field exists on UFC.com's markup.

### `scrape_rankings.py` — the rankings page

- Runs **headless** (the only UFC.com scraper that does — `scrape_roster.py` and
  `scrape_details.py` don't use headless Chrome / don't use Selenium at all).
- Division blocks: `div.view-grouping`, headers: `div.view-grouping-header`. **UFC.com
  renders every division twice** (an active tab pane plus a hidden duplicate/alternate
  pane) — the scraper dedupes by `division_name` via a `seen_divisions` set and skips
  repeats. Forgetting this dedup is the classic way to double every ranking.
  (`scrape_rankings.py:118-122`)
- Champion row: `.rankings--athlete--champion` inside the table `<caption>`, name/link
  via `h5 a`. Pound-for-pound divisions have **no champion row at all** — the loop
  explicitly `break`s before attempting champion parsing when `"pound-for-pound"` is in
  the division name.
- Contender rows: `tbody tr`, rank via `.views-field-weight-class-rank` (skip if `"C"` —
  that's the champion row appearing again in the table body), name/link via
  `.views-field-title a`, rank-change indicator via
  `.views-field-weight-class-rank-change` (only trusted if UFC.com actually renders
  text there — the scraper does not compute deltas itself).
- Matching to a roster UUID is by **normalized name** (`unicodedata` NFKD-strip accents,
  lowercase) against `ufc_fighters_raw.json` — same normalization approach used in
  `scrape_upcoming_fights.py` and `merge_fighters.py`, but implemented independently in
  each file rather than shared.

---

## External data source: Tapology

Both Tapology scrapers go through `undetected_chromedriver` (see the Chrome-launch race
covered in `scrapers_guide.md`) — Tapology is more bot-defensive than UFC.com, hence the
stealth options (`--disable-blink-features=AutomationControlled`, spoofed `navigator.webdriver`,
a real desktop user-agent) and randomized delays throughout.

### `scrape_tapology.py` — fighter search and profile scrape

**Search/match cascade** (`search_tapology()`, the single most important piece of logic
in this file — everything downstream depends on it finding the *right* fighter):

1. Try the fighter's UFC-listed name as-is, then `NAME_FIXES.get(name.upper())` as a
   second attempt if that mapping exists.
2. Query `tapology.com/search?term=<name>&searchType=fighters`, collect every
   `a[href*='/fightcenter/fighters/']` link on the results page.
3. If exactly one link comes back, take it.
4. Otherwise, **strip quoted nicknames** from each result's displayed text (`Max
   "Blessed" Holloway` → `Max Holloway`) and re-match against the searched name. If
   that narrows it to one, take it.
5. If still ambiguous (a common surname, multiple same-named fighters), **pick by total
   fight count**: parse the `W-L-D` record shown in each candidate's search-result table
   row, sum the three numbers, and take the candidate with the most total fights — the
   assumption being the UFC-caliber fighter has the longer record.
6. If it's the last name variation being tried and nothing matched cleanly, fall back to
   the first search result rather than giving up.

This is inherently heuristic — a genuine same-name active-and-inactive fighter pair
could pick the wrong one. If a Tapology profile ever looks attached to the wrong person,
this cascade (not the profile-scraping code) is where to look first.

**Profile page extraction** (`extract_fighter_data()`), all via `BeautifulSoup` on the
rendered page source:
- Age: `span[data-controller='age-calc']`, birth year extracted via regex, age computed
  from the current year (not scraped as a literal age value).
- Country/weight class/nickname: plain regex over the page's visible text
  (`Born:`, `Weight Class:`, `Nickname:`), not structured selectors. Country values that
  match a US state name are normalized to `"United States"`; `"Lagos"` is hardcoded to
  `"Nigeria"` (a specific past mismatch, not a general rule).
- Height/reach: located by finding a `<strong>` containing `"Height:"`/`"Reach:"`, then
  reading a sibling `<span>` for the value — with a page-text regex fallback if the
  structured lookup fails.
- **UFC-specific record and method breakdown** (wins/losses by KO/Sub/Decision, UFC-only,
  not overall MMA record): found by locating an `<img alt="UFC...">`, walking up parents
  until one contains `.mainRecord`, then reading `.mainRecord .wins/.losses/.draws
  .mainValue` and `.methodRecord .methodRecordWins/.methodRecordLosses` (numeric `div`s
  in KO/Sub/Decision order). If no UFC section is found at all, the overall record is
  used as a fallback for the UFC-specific fields too — meaning a fighter's "UFC record"
  can silently equal their all-promotions record if this selector chain fails.
- `SessionManager.record_error()` implements an **escalating backoff**: 3 consecutive
  failures → pause 30-60s, 5 consecutive → pause 120-180s. This is deliberate
  self-throttling to avoid a Tapology IP block, not a bug — don't "fix" it by removing
  the sleep if a run looks slow.

**Run modes** (`scrape_tapology.py`'s own `if __name__` block has **4** modes — more
than `scrapers_guide.md`'s top-level table lists):
```
[1] Production mode  - all active fighters (asks sequential vs. concurrent-4-workers)
[2] Retry failed      - from data/errors/tapology_failures.json
[3] Manual list       - paste specific fighter names, one per line
[4] Recently fought    - re-scrape fighters from recent events (by cutoff date)
```
`run_scheduled.py --task weekly_fighters` always answers `"1\n1"` (production mode,
then sequential) — sequential specifically because it's more reliable unattended, per
`run_scheduled.py`'s own comment.

### `scrape_upcoming_fights.py` — event list and fight cards

Tapology's markup here uses Tailwind-style utility classes directly as selectors (no
semantic class names), which makes them more likely to break on a Tapology redesign
than typical `id`/BEM-style selectors elsewhere in this codebase:

- Event list: `a[href^='/fightcenter/events/']` on `tapology.com/fightcenter?group=ufc`,
  filtered to links containing `"ufc"` (case-insensitive) in the href.
- Event date/time: a `<span>` whose text contains `"Date/Time:"`, value from
  `find_next_sibling("span")`.
- Venue/location: **four fallback methods** in order — structured `li.leading-normal`
  list items with `span.font-bold.text-neutral-900` (label) / `span.text-neutral-700`
  (value); a looser "find any bold span, look at its sibling or parent" search; a
  page-text regex fallback; and, as a last resort, scanning for known venue keywords
  (`"arena"`, `"apex"`, `"dome"`, etc.) in any `span.text-neutral-700`.
- Fight card image: tried against a list of `img` selectors (`img[alt*='UFC']`,
  `img[src*='poster']`, `img.w-4/5`, etc.) — first match wins. Saved to
  `ufc-tracker/public/fight_cards/<sanitized event title>.jpg`.
- Individual fights: `li[data-controller='table-row-background']` blocks. Fighter names
  via `div.order-1 a.link-primary-red` / `div.order-2 a.link-primary-red` (order-1 is
  always fighter1), card section via `a[href^='/fightcenter/bouts/']`, weight class via
  `span.bg-tap_darkgold`.
- UUID resolution uses the same `load_uuid_lookup()` → `normalize_name()` approach as
  `scrape_rankings.py`, against `data/ufc_fighters_raw.json`. A fight where either side
  can't be resolved goes through the missing-UUID path (`data/errors/upcoming_errors.json`)
  described in `scrapers_guide.md`'s "Adding a New Fighter" section, and gets a plain
  insert instead of the `fighter_pair` upsert on the next `upload_upcoming_fights.py` run
  (see `db-schema.md`'s `upcoming_fights` gotchas).
- Run modes: `[1]` full scrape, `[2]` only try missing UUIDs, `[3]` retry failed event
  cards — matches what `scrapers_guide.md` already documents.

---

## `utils/name_fixes.py` — what the dicts actually mean today

**This file currently has 3 dicts, not 4.** `scrapers_guide.md`'s "Configuration Files"
section (and the `ufc-database` skill's "Name-matching quirks" section) describe a
fourth dict, `URL_OVERRIDES`, and a separate `TAPOLOGY_FIXES` dict — **neither exists in
the current file.** Both got folded into `NAME_FIXES` at some point during the
Sherdog→Tapology migration; the comment at `name_fixes.py:132` (`# From TAPOLOGY_FIXES
(flipped to UFC RAW : Tapology)`) is the only trace of that history left in the code.
Don't add code that imports `URL_OVERRIDES` or `TAPOLOGY_FIXES` expecting them to
exist — they'll `ImportError`.

- **`NAME_FIXES`** (`{UFC_RAW_NAME: Tapology_display_name}`, keys uppercase) — the
  single name-matching table, consumed by two different pieces of code in two different
  ways:
  - `scrape_tapology.py`'s `search_tapology()` uses it as a *second search attempt*
    (`apply_name_fixes()`) when the raw UFC name doesn't resolve.
  - `supabase/merge_fighters.py`'s `create_name_fixes_lookup()` uses it as a
    *normalized-name lookup table* when matching an already-scraped `tapology_fighters.json`
    record back to the UFC roster (exact normalized match first, then this dict, then
    suffix/punctuation variations like stripping `JR`/`SR`/hyphens/periods, then a
    partial-name match as a last resort).
  - The bottom ~15 entries (from the `# From TAPOLOGY_FIXES` comment down) are stored
    **backwards relative to the rest of the file** — they map a Tapology-style name to
    the corresponding value, added when the old separate `TAPOLOGY_FIXES` dict was
    merged in "flipped." Read the comment before assuming every entry follows the same
    `UFC → Tapology` direction as the entries above it.
- **`POWER_SLAP`** — a `set` (not a dict) of uppercase names. Used only to force
  `status = "Power Slap"` in `scrape_roster.py` for fighters who compete in Power Slap
  rather than UFC MMA, overriding whatever status their UFC.com profile page shows.
- **`UFC_ROSTER`** (`{"Display Name": "ufc.com profile URL"}`) — manual roster
  injection list for fighters `scrape_roster.py`'s automated crawl doesn't pick up on
  its own. **Always check for an existing roster entry with the same profile URL before
  adding a new one here** — this exact mistake (a name-mismatch treated as a missing
  fighter) has created a duplicate UUID in production before. Full detail in
  `scrapers_guide.md`'s "Adding a New Fighter" section — not repeated here.

---

## If something here looks stale

Selectors are the most likely thing in this whole codebase to silently drift — a UFC.com
or Tapology redesign won't throw an obvious error, it'll just make one of the fallback
methods above kick in (or return `None`/`{}` quietly). If a field that's normally
populated starts coming back empty across many fighters at once, that's the signal to
re-check the relevant selector against the live page rather than assume the scraper
logic itself regressed.
