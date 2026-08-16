# UI overhaul — design system foundation + Upcoming Fights redesign

## Problem

The app's UI reads as generic AI-generated output rather than a distinct, modern product: translucent glowing borders (`rgba(37,99,235,0.X)` everywhere), gradient-text headings, emoji used as icons and flags, cookie-cutter card/badge components, and weak visual hierarchy. There's no strong brand identity — headers are just emoji + gradient text, not a real wordmark or logo.

## Approach

Design-system-first, proven on the single most-used page, then rolled out to the rest of the app.

Page usage ranking (from most to least trafficked): **Upcoming Fights** (checked most — "is there a new fight for my favorite fighters") → Events (fight-day) → Rankings (occasional) → Stats (exploratory, underused, candidate to surface inline elsewhere later) → Search (only when adding a fighter) → Favorites (only when removing one) → Picks (not built yet).

Primary device split: **mobile for quick glances, desktop for deeper analysis**. This spec covers the mobile layout only. Desktop and the remaining pages (Events, Rankings, Stats, Search, Favorites, NavBar) are out of scope here and follow as separate specs once this pattern is validated in the live app.

This spec covers: the shared design principles, and a full mobile redesign of the **Upcoming Fights** page as the flagship/proving-ground page for those principles.

## Design principles (apply across future pages too)

These came out of iterating on mockups and having several proposed directions explicitly rejected — the rejections are as load-bearing as the approvals:

1. **No decorative colored borders or accents.** Left-border color strips, top-border accent lines, colored underlines under avatars — all rejected as an "AI tell" even when tied to real content meaning (e.g. red/blue fight-corner colors). Hierarchy and identity come from typography, scale, spacing, and background surface tiering — never from a colored border.
2. **No translucent/glow effects.** No `rgba()` borders, no `backdrop-filter: blur`, no box-shadow glow, no gradient fills or gradient text. Flat solid fills only.
3. **No emoji as UI content.** Not as header icons (⚔️, 🥊), not as badges (👑, 🥇), not as flags (🏴). Use a real icon set (lucide-react, already a dependency) and text (e.g. 3-letter country codes like "RUS" instead of flag emoji).
4. **Two-theme system stays, and its meaning stays intentional.** Gold/black = stats and objective info (Events, Rankings, and objective badges like "Champion" even on blue-themed pages). Blue = personal (Search, Favorites, Upcoming Fights, Stats, favorited/interested status). Don't collapse into one palette — the split itself is informative.
5. **A bold condensed display face (Bebas Neue) is reserved exclusively for fighter names.** It's the one typographic "loud" moment on the page — used nowhere else (not page titles at the fighter tier, not event names, not UI chrome). This is the main device that keeps fighters as the visual subject and stops every text element from competing for attention. Page-level titles may use it once (e.g. the H1), but event names and body/meta text stay in the system sans font.
6. **Tall portrait photo blocks, not circular avatars.** The fighter images already in Supabase are full-body cutout PNGs — a circular thumbnail throws that away. Use a portrait-orientation block (rounded top corners) sized to actually show the cutout.
7. **Gold is meaningful, not decorative.** Only used for objective status (champion, P4P rank) — never as a generic "accent" color applied for visual interest.
8. **Structural hierarchy over decorative hierarchy.** The headline/marquee fight in an event stands out through larger scale, bigger portraits, and the champion badge — not through a colored border or background tint on just that card. Sections (events) stand out through actual background-surface tiering (a distinct card with a banded header), not a thin divider line.
9. **Don't restate what's already implied.** Upcoming Fights only ever lists fights involving a followed fighter — so a per-card "on your list" banner is redundant. Favorite/interested status is shown as a small inline star directly next to the specific fighter's name instead.
10. **Date is the primary scan target on mobile** (this is literally why Jared opens this page). Each event leads with a date chip (day number + month), not a small muted text line.

## Upcoming Fights — mobile layout

Structure, top to bottom:

- **Top bar**: logo mark placeholder (dashed box, "LOGO") + wordmark + menu icon. Not a redesign of nav itself — just marks where a real logo asset goes once Jared has one. NavBar redesign is a separate future spec.
- **Page header**: "Upcoming fights" as the one page-level Bebas Neue moment, subtitle line (fight/event count), dark/light toggle icon (existing app behavior, unchanged).
- **Countdown**: rendered as a typographic stat ("1 day" in Bebas Neue + accent color) with a caption naming the event — not a boxed/bordered widget.
- **Search + filter chips**: flat filled input (no border, background-fill only), pill filter chips for All/Favorites/Interested.
- **Results summary**: plain text line ("7 fights across 4 events you follow").
- **Event list**: each event is its own card (`background: var(--card)`, rounded, `overflow: hidden`) with two visually distinct regions:
  - **Header band**: `background: var(--bg)` (page-level tone, deliberately recessed against the card), containing the date chip (day number in Bebas Neue + month abbreviation) and event name/time/favorite-breakdown in plain sans.
  - **Body**: the fight(s) for that event, on the lighter card surface.
    - Headline treatment rule (matches the approved mockup, corrected from an earlier draft of this spec that was wrong):
      - If an event has exactly **one** followed fight, it always renders as the headline — it's the only fight representing that event, so there's nothing to rank it against (see Aug 22 and Aug 29 events in the mockup — single `interested`-tier fights, both shown large).
      - If an event has **multiple** followed fights, the headline treatment goes to the top-priority one (favorite > interested, same ranking the app already computes) **only if its tier is strictly higher than the next fight's tier** — a genuine standout. If the top fights are tied on tier, none get headline treatment and all render as compact rows (see the Sept 12 event — two `interested`-tier Main Card fights, tied, both compact; contrast with Aug 15/UFC 330 — one `favorite`-tier fight outranks an `interested`-tier one, so the favorite gets the headline).
      - The headline fight renders large: full portrait blocks, first/last name, champion/rank badge, "View full comparison" link. `card_section` (Main Event, Co-Main, etc.) is shown as a small label but does not by itself trigger headline treatment.
    - Any other followed fights in that event render as compact single-line rows (small circular initial avatar, condensed names, `card_section` tag, chevron to expand).
    - No PPV badge — decided not worth the visual noise.
    - Favorited/interested status is a small star icon directly after the specific fighter's name — not a separate banner sentence.

## Color tokens (dark, primary)

```
--bg: #05070c        page background
--card: #151d31      event card / content surface
--text: #f5f7fa
--mute: #7b8698
--accent: #7fa3e0     blue theme accent (links, countdown number)
--gold: #facc15       champion / objective-info only
--portrait: #212c47   photo placeholder fill
--line: #262f47       hairline dividers (rows, internal cta divider)
```

Light-mode equivalents (`--bg: #dde3ed`, `--card: #ffffff`, `--text: #1e293b`, `--mute: #64748b`, `--accent: #2563eb`, `--gold: #a16207`, `--portrait: #e2e8f0`, `--line: #e7eaef`) — same structure, same page/card contrast relationship must hold (card must read as clearly elevated above the page background in both modes). `--gold` is darker than the dark-mode value specifically for contrast: `#eab308` on a white card fails WCAG AA text contrast (~1.9:1); `#a16207` reads clearly (~4.6:1) while staying in the same amber family.

## Typography

- Display: Bebas Neue, self-hosted as a `@font-face` (woff2) in the app rather than a Google Fonts runtime request — fighter names and the page H1 only.
- Body/UI: existing system sans stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`), unchanged.

## Icons

lucide-react (already a dependency). No emoji anywhere. Crown for champion, Star for favorite/interested, Search, ChevronRight/Down, Sun/Moon for theme toggle — same icon vocabulary already used elsewhere in the app.

## Explicitly out of scope for this spec

- NavBar redesign (top bar here is a placeholder only)
- Logo/wordmark asset itself — Jared is creating this; this spec only identifies where it goes
- Desktop layout for Upcoming Fights
- Any other page (Events, Rankings, Stats, Search, Favorites, Picks)
- The main-card-time-shows-early-prelims-time data bug noticed during review — real bug, unrelated to this redesign, to be fixed separately

## Reference

Full interactive mockup (mobile, dark + light toggle, real Supabase data) approved during design review: `https://claude.ai/code/artifact/87148a3b-e190-4437-9492-aa6cc6e541ad`
