# Scorer report — generation 5

**Overall: 10 / 10**  ·  2026-10-07T07:48:26.980Z

| Category | Weight | Score |
|---|---|---|
| Build, tooling & stability | 1 | 10 |
| Automated tests | 1.25 | 9.6 |
| Hard rules (tone, names, assets) | 1 | 10 |
| Data-driven design | 0.75 | 10 |
| Core shooter & game feel | 1.5 | 10 |
| Campus map | 1 | 10 |
| Course flow & systems | 1.25 | 10 |
| Phone-first touch play | 1.25 | 10 |
| Performance | 0.75 | 10 |
| Completeness vs GAME_PLAN (M4–M6) | 1 | 10 |

## Feedback (largest impact first)

1. **[tests] Playwright suite passes** — 95% (−0.05 pts). _19/20 passed · failing: Computer Programming can be completed by a scripted invulnerable player_. Make every Playwright test pass.

## All checks

| | Category | Check | Score | Detail |
|---|---|---|---|---|
| ✓ | build | npm scripts | 100% | all present |
| ✓ | build | stack: Phaser 3 + TypeScript + Vite | 100% | phaser, @playwright/test, typescript, vite |
| ✓ | build | TypeScript strict | 100% |  |
| ✓ | build | vite base './' (GitHub Pages) | 100% |  |
| ✓ | build | GitHub Pages deploy workflow | 100% | found |
| ✓ | build | typecheck passes | 100% |  |
| ✓ | build | production build passes | 100% |  |
| ✓ | performance | first load under 5 MB | 100% | 1.66 MB |
| ✓ | rules | v1 ships no external art/audio files | 100% | none |
| ✓ | rules | tone: no guns, blood or violence words | 100% | clean |
| ✓ | rules | professors only appear by displayName | 100% | Metroman, Prof. Admin Manzur, Prof. Bezout Argminov |
| ✓ | rules | no imitated-accent dialog | 100% |  |
| ✓ | rules | professors cannot be damaged (no damage path to NPCs) | 100% |  |
| ✓ | rules | mute button always available | 100% |  |
| ✓ | rules | CREDITS.md present | 100% |  |
| ✓ | data | every t() key exists in en.json | 100% | 104 keys ok |
| ✓ | data | no hard-coded player-facing strings in scenes | 100% | none |
| ✓ | data | arena rooms exist as data (src/data/rooms) | 100% | computer_lab, exam_hall, lecture_hall, physics_lab |
| ✓ | data | balance numbers come from enemies.json | 100% |  |
| ✓ | data | no balance literals in Arena | 100% | none |
| ✓ | data | AssetRegistry lets sprites be swapped for files | 100% |  |
| ✓ | data | sounds swappable via the registry too | 100% |  |
| ✓ | plan | Russian and Uzbek text files (same keys) | 100% | ru, uz · 100% key coverage |
| ✓ | plan | README with how to play | 100% | 3518 chars |
| ✓ | plan | easter eggs wired in | 100% | 6/6 |
| ✓ | plan | all five hazards implemented | 100% | portal_down, attendance_sheet, eight_am, deadline_wall, wifi_dead |
| ✓ | plan | menu features (name, language, credits, share) | 100% | missing: none |
| ✓ | plan | font covering Latin, Cyrillic and Uzbek (oʻ, gʻ) | 100% | webfont loaded |
| ✓ | plan | desktop + 844×390 screenshots in docs/screens | 100% | 6 desktop, 3 phone |
| ✓ | plan | music for every context (data-driven sequencer) | 100% | menu, campus, stage, midterm, final, results, retake |
| ✓ | tests | test suite exists | 100% | 6 spec files |
| ✓ | performance | boots to the title screen quickly | 100% | 4199 ms |
| ✓ | campus | every walkable tile reachable from playerStart | 100% | 9236/9236 |
| ✓ | campus | collision grid matches campus.json tile for tile | 100% | 18720/18720 |
| ✓ | campus | player walks on campus | 100% | moved 25 px |
| ✓ | campus | professor NPCs placed from campus.json | 100% |  |
| ✓ | campus | minimap and objective on campus | 100% | Objective: talk to Prof. Admin Manzur |
| ✓ | systems | talking to a professor opens dialog then the portal quest card | 100% | dialog=true quest=true |
| ✓ | systems | accepting the quest unlocks the course | 100% |  |
| ✓ | campus | south gate → north-west building in 20–30 s | 100% | 23.9 s |
| ✓ | campus | Wi-Fi dead zone disables the minimap | 100% |  |
| ✓ | shooter | arena loads with stage from course components | 100% | {"course":"computer_programming","index":0,"type":"ca","hpBudget":800,"total":800} |
| ✓ | shooter | mouse fire spends the 30-shot clip | 100% | clip 21 |
| ✓ | shooter | semicolons damage paper | 100% | 30 hp destroyed |
| ✓ | shooter | empty clip shows error and 'compiling...' reload | 100% |  |
| ✓ | shooter | coffee throw splashes and makes paper soggy | 100% | thrown=true ammo 3→2, soggy=true |
| ✓ | shooter | dash (all-nighter) bursts the player forward | 100% | 51 px |
| ✓ | shooter | professor assist (H) works once per stage | 100% | sanity 30→70 |
| ✓ | shooter | synthesised sound effects fire | 100% | 11 kinds: ding, hurt, shoot, tear, empty, reload, throw, pickup, splash, hit, dash |
| ✓ | shooter | Deadline counts down | 100% | 41.7→40.5 |
| ✓ | shooter | feel: shake, hit flash, shreds, stains, damage numbers | 100% | shake, setTintFill, explode, stain, floatText |
| ✓ | shooter | enemy behaviours and both bosses | 100% | swarm_chase, chase_and_shoot, onDeath, midterm_plane, phase |
| ✓ | performance | 60 papers on screen hold the frame rate | 100% | idle 36 fps → 37 fps with 69 papers |
| ✓ | performance | 4× CPU throttle (mid-range Android) stays playable | 100% | 30 fps throttled (baseline 36) |
| ✓ | systems | mercy pass in Prof. Admin's course | 100% | {"computer_programming":[70]} |
| ✓ | systems | Engineering Physics completes start to finish (scripted player) | 100% | 98% A in 120 s |
| ✓ | systems | progress survives a reload | 100% |  |
| ✓ | systems | transcript with GPA at the end of the semester | 100% | transcript=true gpa=3 |
| ✓ | plan | language switch works (en / ru / uz) | 100% | [["ru","ru"],["uz","uz"]] |
| ✓ | touch | canvas fills the 844×390 screen | 100% | 693×390 |
| ✓ | touch | tap to start works on touch | 100% |  |
| ✓ | touch | left-thumb joystick moves the player | 100% | 56 px |
| ✓ | touch | auto-aim + auto-fire on touch | 100% | clip 16 |
| ✓ | touch | coffee, dash and help buttons on screen | 100% | coffee, dash, help |
| ✓ | touch | tapping the coffee button throws coffee | 100% | 3→2 |
| ✓ | touch | no HUD text overflows the screen | 100% | none |
| ✓ | touch | "rotate your phone" screen in portrait | 100% |  |
| ✓ | build | no console errors during probes | 100% | none |
| ~ | tests | Playwright suite passes | 95% | 19/20 passed · failing: Computer Programming can be completed by a scripted invulnerable player |
