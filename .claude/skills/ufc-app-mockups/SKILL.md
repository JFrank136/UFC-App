---
name: ufc-app-mockups
description: Build real-data visual mockups (as Claude Artifacts) when brainstorming a UI redesign for a page in Jared's UFC app. Use whenever the brainstorming skill calls for a visual mockup on this project, or when Jared is unsure of a direction and needs 2-3 concrete options to react to instead of a described one.
---

# UFC app UI mockups

Companion to the `brainstorming` skill for this project specifically. When a design question would benefit from being seen rather than described, build 2-3 concrete mockups from real data rather than asking Jared to pick a direction in the abstract — he's said this explicitly more than once (see memory: design-mockup-iteration-style).

## Process

1. **Pull real data first.** Use the Supabase MCP tools against project_id `vzpkhnmomrutuceqfnoq` to get real fighters/events/rankings for whatever page you're mocking up — never placeholder/lorem content. Prefer fights or fighters already relevant to Jared's favorites where it makes the mockup feel authentic.
2. **Self-host Bebas Neue** (the app's display font, reserved for fighter names / page titles / big numbers — see memory: ufc-app-design-principles). Download and inline it as a base64 `@font-face` data URI:
   ```bash
   curl -s "https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2" -o bebas.woff2
   base64 -w0 bebas.woff2 > bebas.b64
   ```
   Embed the base64 content directly in the mockup's `<style>` block as `src: url(data:font/woff2;base64,...)`.
3. **Use the established color tokens** (dark theme; see the app's actual `UpcomingFights.module.css` for the current canonical values, these may drift page to page):
   ```
   --bg: #05070c        page background
   --card: #151d31      card/content surface
   --text: #f5f7fa
   --mute: #7b8698
   --accent: #7fa3e0    blue, "your info" (favorites/personal)
   --gold: #facc15      gold, objective status only (champion, rank) — not decorative
   --portrait: #212c47  photo placeholder fill
   --line: #262f47      hairlines
   ```
   Light-mode equivalents exist too — check the current CSS module rather than assuming these stay fixed.
4. **Follow the design principles memory** (ufc-app-design-principles): no emoji, no gradients/glow/decorative colored borders, Bebas Neue only for names/titles/big numbers, real icons (lucide-react equivalents, e.g. Tabler `ti-flame` in the Artifact sandbox) instead of anything emoji-shaped.
5. **Build as an Artifact**, not the `mcp__visualize` widget tool — the widget tool forces Claude's own neutral design system, which is wrong for mocking up a different product's branded UI. Load the `artifact-design` skill first per its own requirement.
6. **Show 2-3 distinct directions** when the direction itself is undecided, not one. Label them lightly (A/B/C) so Jared can reference and mix parts. Iterate on the same published Artifact URL (pass `url:` back in) rather than creating a new one each round, so the link stays stable across the conversation.
7. **Real device width matters** — mock up at the actual target viewport (375px mobile, 1280-1360px+ desktop), not the widget's default width. A past mistake was showing a mockup too small/narrow to judge real scale — Jared explicitly couldn't tell if a layout was too tight until seeing it at real width.

## Known pitfall

External image domains (e.g. `ufc.com` fighter photos) are blocked by the Artifact sandbox's CSP — use solid-color placeholder blocks with initials instead, and say so explicitly (the real app renders actual photos fine, this is a mockup-tool limitation, not the intended final look).
