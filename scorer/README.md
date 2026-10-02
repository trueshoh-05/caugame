# Scorer

`node scorer/score.mjs` (or `npm run score`) rates CAU: Semester Survivor out of 10 against
`CLAUDE.md` and `GAME_PLAN.md`, explains every lost point, and suggests the fix.

## How it decides

About 75 checks in ten weighted categories. Each check scores 0–1 and has its own weight;
a category's score is its weighted pass rate × 10, and the overall score is the weighted mean
of the categories.

| Category | Weight | What it looks at |
|---|---|---|
| Build, tooling & stability | 1.0 | npm scripts, strict TypeScript, Vite `base: './'`, Pages workflow, type-check, build, console errors during play |
| Automated tests | 1.25 | the Playwright suite's pass ratio, spec coverage |
| Hard rules | 1.0 | tone (no gun/blood vocabulary anywhere), professors by display name only, no accent jokes, no asset files, mute button, CREDITS.md |
| Data-driven design | 0.75 | every `t()` key exists, no hard-coded strings in scenes, rooms as data, balance only in `enemies.json`, AssetRegistry for sprites and sounds |
| Core shooter & game feel | 1.5 | live: firing spends the clip, hits damage paper, empty clip → `compiling...`, coffee splash + soggy, dash, professor assist, sfx, deadline, feel effects, behaviours, bosses |
| Campus map | 1.0 | live: collision grid equals `campus.json` tile for tile, every walkable tile reachable, NPC placement, minimap/objective, 20–30 s crossing, Wi-Fi dead zone |
| Course flow & systems | 1.25 | live: dialog → quest card → accept, mercy pass, a full course cleared by a scripted invulnerable player that really shoots, save across reload, transcript GPA |
| Phone-first touch play | 1.25 | live at 844×390 with touch: canvas fills screen, tap to start, joystick, auto-fire, coffee/dash/help buttons, button taps, no text overflow, portrait rotate screen |
| Performance | 0.75 | first load < 5 MB, boot time, frame rate with 60 papers, 4× CPU throttle |
| Completeness vs GAME_PLAN | 1.0 | ru/uz text with the same keys, language switch, README, easter eggs, five hazards, name/credits/share, a Cyrillic + Uzbek font, music per context, screenshots |

Headless Chromium renders WebGL in software, so frame-rate checks compare against the same
machine's idle baseline rather than a fixed 60 fps.

## Output

- `scorer/reports/gen-N.md` — category table, feedback sorted by points lost, every check.
- `scorer/reports/gen-N.json` — the same, machine-readable.
- `scorer/HISTORY.md` — one row per generation.

Flags: `--gen N` (report number), `--skip-tests` (skip the Playwright suite), `--static` (no browser),
`--target 8` (exit code 0 only at or above this score).

## Improvement loop

The scorer is the judge; the improver (here, Claude Code) reads the feedback, fixes the biggest
losses first, and re-scores. The loop stops at **8/10 or after 3 improvement generations**,
whichever comes first. The log of what each generation changed is below.

## Improvement log

| Gen | Score | What changed |
|---|---|---|
| 0 | 9.0 | First full build: campus from `campus.json`, three courses with waves and both bosses, dialog / quest card / results / transcript, synthesised audio, touch controls, save, Playwright suite. Feedback: no ru/uz text, no README, CREDITS or Pages workflow, system font only, scripted player could not finish a course (1/2 Engineering Physics stages). |
| 1 | 9.8 | **Bug:** the final boss hid behind the centre desk, which blocked every semicolon — boss stages now let shots fly over desks (desks still shield the player). Added Russian and Uzbek text (same keys), Noto Sans Mono webfont (Latin, Cyrillic, oʻ/gʻ), README, CREDITS, GitHub Pages workflow, student-name field with the `sudo` easter egg, credits panel, real sound-file swapping in the AssetRegistry, campus painted while the menu is idle. Scorer fix: easter eggs referenced through a dynamic key were counted as missing. |
| 2 | 9.7 | **Bug:** Results and QuestCard added `update` listeners in `create()`; Phaser keeps them across scene restarts, so stale handlers from earlier stages swallowed the E press and replayed old stages. Both now use `update()`. Tests and probes trust the sandbox's HTTPS proxy CA (it broke the webfont request in headless Chromium). Scorer fixes: dynamic `t()` key prefixes and a flaky coffee probe. Small dip from probe flakiness (mouse probe aimed through a desk, font retries slowing boot). |
| 3 | 9.8 | Probe aims the mouse at a real paper instead of through a desk; Playwright runs one worker (the scripted course runs in real time); webfont wait cut to 0.7 s. Still open: in this sandbox Google Fonts requests fail through the proxy (one console error, slow boot), and the full Computer Programming run is flaky inside the whole suite (passes on its own). Loop stopped: 3 improvement generations reached. |
