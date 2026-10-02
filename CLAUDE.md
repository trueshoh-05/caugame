# CAU Campus Shooter — build instructions

A free browser game for computer science students at Central Asian University (CAU), Tashkent. The player is a student who shoots living assignments (paper) with a laptop, on a map of the real campus. Professors are helpers, never targets.

## Read first
1. `GAME_PLAN.md` — the full design. It is the source of truth for what the game is.
2. `src/data/*.json` — starter content, already written: `campus.json` (map), `courses.json`, `professors.json`, `enemies.json` (all balance numbers), `text/en.json` (all English text).
3. `reference/` — `campus_plan.png` (official 2D plan), `campus_plan_rotated.png` (the same plan turned and cropped to match the tile grid exactly, 8 px per tile), `campus_3d_marked.jpg` (3D render; CAU is inside the red line), `layout_preview.png` and `plan_vs_map.png` (renderings of `campus.json`).

## Stack
- Phaser 3 (latest 3.x), TypeScript (strict), Vite. No backend. No UI framework.
- Arcade physics. Internal resolution 480×270, `pixelArt: true`, `Phaser.Scale.FIT` with integer zoom where possible.
- `vite.config.ts`: `base: './'` so the build works under a GitHub Pages sub-path.
- Tests: Playwright (Chromium is pre-installed in cloud sessions; do not run `playwright install`).
- Scripts: `npm run dev`, `npm run build`, `npm run preview`, `npm test`.

## Hard rules
1. **Tone.** The weapon is a laptop. Projectiles are semicolons and coffee. Enemies are paper. No guns, no blood, no human targets. Professors and student NPCs cannot be damaged, ever.
2. **No real names.** Professors appear only under the `displayName` in `professors.json`. Never write a professor's real name in code, comments, text, commit messages or the README.
3. **No accent or appearance jokes.** Never write dialog with misspellings that imitate pronunciation. Humour comes from catchphrases, course content and university life.
4. **Data, not code.** All numbers come from `enemies.json`; all text from `src/data/text/<lang>.json`; the map from `campus.json`. Adding a professor, course, enemy or room must not require new code.
5. **Pure shooter.** No puzzle mechanics and no CS-knowledge tricks. Move, shoot, dodge.
6. **Phone first.** Everything must work with touch at 844×390 landscape before it is considered done. Show a "rotate your phone" screen in portrait.
7. **No downloaded assets without a licence.** Version 1 uses no external art or audio files at all (see below). Anything added later is CC0 or CC-BY and listed in `CREDITS.md`.
8. **No brand logos.** "MacCoffee" and "Nescafe" appear as text only; sachet and cup sprites are original drawings. No CAU logo; the university's name in text is fine.
9. Do not copy the look of any existing film or game character. "Metroman" is a nickname; his sprite is an original design.

## Art and audio in version 1 (no asset files)
- **Sprites are defined in code** as small pixel grids (arrays of strings, one character per pixel, mapped to the palette) in `src/art/`, and turned into textures at boot. Palette: Endesga 32.
- Tiles 16×16, characters about 16×24, bosses 48–64 px. Professors are told apart by their `signatureItem`.
- **Sound effects** are synthesised at runtime (jsfxr-style parameters via Web Audio). **Music** is a small step-sequencer playing chiptune patterns defined in data; the pattern's playback speed rises as the Deadline approaches.
- Audio starts only after the first tap. A mute button is always visible.
- Keep an `AssetRegistry` so every sprite and sound can later be swapped for a real file without touching game code.

## Map
- `campus.json` is a **tile grid traced from the real plan**: `grid` is 144 rows of 130 characters, one character per tile, decoded by `legend` (which also says what is walkable). Do not redraw, simplify or "tidy" the layout; footprints and proportions are true to the plan.
- `MapBuilder` turns the grid into the tilemap at load. A building is a connected group of `#` and `a` tiles; find each one by flood-filling from its `seed` tile in `buildings` (do not match by `bbox`: the annexes sit inside the main complex's bounding box). Choose wall edges, corners and roofs automatically from neighbouring tiles (autotiling), so the rotated south building and the zigzag facade come out as stepped walls.
- **The main complex is one building**: north wing, a narrow link, east wing, south link and west wing, wrapped around a tree courtyard that is open only to the north. Draw it with one continuous roof.
- `a` tiles are an archway through the south link: walkable, with the building's roof drawn above the player.
- Only `#` and `.` block movement. Trees (`t`) are decoration with the canopy drawn above the player; canals (`w`) are narrow ditches the player steps over; `s` is outdoor steps.
- `.` is outside the campus: draw a fence or hedge along the boundary and plain street beyond. The camera is clamped to the grid.
- Each door has `at` (the building-edge tile that becomes the door), `front` (the walkable tile outside it) and `leadsTo`. Doors with `leadsTo: null` are locked ("Room 404: not found" style jokes are welcome).
- Place `gates`, `npcs`, `pickups`, `props` and `zones` from the file. The red ribbon path (`r`) and guide paths (`=`) get their own paving so players can navigate by them.
- Debug key **M** overlays `reference/campus_plan_rotated.png` at 50% opacity, scaled so 8 image pixels = 1 tile (dev builds only). It must line up with the map exactly.
- Arena rooms (`computer_lab`, `lecture_hall`, `physics_lab`, `exam_hall`) are single-screen layouts in `src/data/rooms/`, with desks as cover. Create them; they may use a simple rect-based format.
- Building names live only in `campus.json`. Only the Architecture and Engineering building's name is confirmed.

## Systems to build
`Input` (keyboard + mouse, and touch joystick with auto-aim), `MapBuilder`, `Stages` (builds stages from a course's grade components and `stageSizing`), `Dialog` (typewriter text, per-professor blip pitch, automatic tic insertion at `{tic}`, formula bubbles, `lang` overrides), `Grades` (scores, course percent, letter, GPA, credits), `Save` (localStorage), `Audio`, `Language` (en / ru / uz; start with en, fall back to en for missing keys).

Scenes: `Boot`, `Preload`, `Menu`, `Campus`, `Arena`, `Dialog` (overlay), `HUD` (overlay), `QuestCard`, `Results`, `Transcript`.

## Milestones
Work in order. Finish, test, commit and report after each one; do not start the next until the acceptance checks pass.

**M0 — Scaffold.** Vite + TypeScript + Phaser project around the existing `src/data`. GitHub Actions workflow that builds and deploys to GitHub Pages on push to `main`. Playwright smoke test.
*Accept:* `npm run build` passes; the deployed page shows a title screen; smoke test green.

**M1 — Grey-box shooter.** One blank arena. Player moves, fires C++'s Semicolons (clip, "compiling..." reload), throws coffee (splash, soggy), dashes. `quiz` and `homework` enemies from `enemies.json`. Sanity, death, restart. Touch controls with auto-aim.
*Accept:* playable start to finish on desktop and at 844×390 touch; 60 fps with 60 enemies on screen (object pools); no console errors.

**M2 — Campus.** `MapBuilder` renders `campus.json`. Player walks the campus with a following camera, collides with buildings, enters doors. Minimap. Three professor NPCs stand where `npcs` says.
*Accept:* a screenshot of the whole map matches `layout_preview.png` tile for tile, and the M overlay lines up with the plan; every enterable door works; every walkable tile is reachable from `playerStart`; walking from the south gate to the north-west building takes 20–30 seconds.

**M3 — One full course (Computer Programming).** Dialog system, quest card styled like the course portal page ("No data"), stages built from the 20 / 10 / 20 / 50 components, all five paper types, `midterm_paper` and `final_exam` bosses, Deadline wall, professor assist, mercy pass, results screen, HUD styled like a code editor, sound effects.
*Accept:* the course can be played from quest to grade; failing a stage triggers the mercy pass; stage health totals match `stageSizing`; a Playwright test completes the course with a scripted invulnerable player.

**M4 — Whole semester.** Calculus for Engineers and Engineering Physics with their own professors, arenas and paper skins; tic insertion for Metroman with the 50-count achievement; formula bubbles and Uzbek asides for Prof. Bezout; hazards; upgrades shop; transcript with GPA; save and resume.
*Accept:* a full semester is playable in 15–25 minutes; progress survives a page reload.

**M5 — Feel and sound.** Screen shake, hit flash, paper shreds, coffee stains, damage numbers as "−5%", music sequencer with Deadline speed-up, loading tips, terminal joke line, easter eggs from `text/en.json`.
*Accept:* first load under 5 MB; still 60 fps on a mid-range Android profile (4× CPU throttle in Playwright).

**M6 — Languages and share.** `ru.json` and `uz.json` (same keys), language picker, a font covering Latin, Cyrillic and Uzbek letters (oʻ, gʻ), shareable transcript image (canvas to PNG), `CREDITS.md`, README with how to play.
*Accept:* all three languages render without missing glyphs or overflowing boxes.

## Testing
- `npm run build` and `npm test` before every commit.
- Expose a small debug handle in dev builds (`window.__game`) so tests can read state (scene, player position, sanity, enemies alive) and toggle invulnerability.
- For every milestone, save desktop and 844×390 screenshots to `docs/screens/` and look at them before reporting.

## Open items (placeholders in the data, marked `confirmed: false` or by name)
- Real names of the buildings in `campus.json` (only Architecture and Engineering is confirmed), which one is Avicenna Hall, and which building each course is really taught in.
- Grade components for Calculus for Engineers.
- CAU's real grading scale.
- Real coffee and food spots on campus; real Wi-Fi dead zones.
- Whether Metroman, Prof. Admin and Prof. Bezout have seen and approved their characters.
