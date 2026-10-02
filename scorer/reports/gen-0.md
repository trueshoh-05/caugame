# Scorer report — generation 0

**Overall: 9 / 10**  ·  2026-10-02T22:38:03.300Z

| Category | Weight | Score |
|---|---|---|
| Build, tooling & stability | 1 | 8.8 |
| Automated tests | 1.25 | 9.5 |
| Hard rules (tone, names, assets) | 1 | 8.9 |
| Data-driven design | 0.75 | 10 |
| Core shooter & game feel | 1.5 | 10 |
| Campus map | 1 | 10 |
| Course flow & systems | 1.25 | 8.8 |
| Phone-first touch play | 1.25 | 10 |
| Performance | 0.75 | 9.2 |
| Completeness vs GAME_PLAN (M4–M6) | 1 | 4.4 |

## Feedback (largest impact first)

1. **[plan] Russian and Uzbek text files (same keys)** — 0% (−0.2 pts). _missing_. Add src/data/text/ru.json and uz.json with the same keys as en.json.
2. **[systems] Engineering Physics completes start to finish (scripted player)** — 50% (−0.15 pts). _1/2 stages_. A scripted invulnerable player must be able to clear every stage by shooting.
3. **[build] GitHub Pages deploy workflow** — 0% (−0.11 pts). _missing_. Add .github/workflows/*.yml that builds and deploys to GitHub Pages on push to main.
4. **[rules] CREDITS.md present** — 0% (−0.1 pts). Add CREDITS.md (even if v1 has no external assets, say so and credit the palette).
5. **[plan] README with how to play** — 0% (−0.1 pts). _missing_. Add README.md with controls (desktop + phone), dev commands and the scorer.
6. **[plan] language switch works (en / ru / uz)** — 0% (−0.1 pts). _[["ru","en"],["uz","en"]]_. Language picker must switch to ru and uz.
7. **[plan] font covering Latin, Cyrillic and Uzbek (oʻ, gʻ)** — 30% (−0.07 pts). _system monospace only_. Load a font with Latin, Cyrillic and oʻ/gʻ (e.g. a Google Font with cyrillic subset) and fall back to monospace.
8. **[tests] Playwright suite passes** — 94% (−0.06 pts). _15/16 passed · failing: Computer Programming can be completed by a scripted invulnerable player_. Make every Playwright test pass.
9. **[plan] easter eggs wired in** — 50% (−0.05 pts). _3/6 missing: outOfBounds, floor0, sudoName_. Use every joke in text.easterEggs somewhere in the game.
10. **[performance] boots to the title screen quickly** — 50% (−0.05 pts). _6185 ms_. Speed up boot (paint the campus lazily, keep the bundle small).
11. **[plan] menu features (name, language, credits, share)** — 83% (−0.02 pts). _missing: enterName_. Add a student-name field, language picker, credits screen and share button.
12. **[data] every t() key exists in en.json** — 99% (−0 pts). _missing: questCard.components._. Add the missing keys to src/data/text/en.json.

## All checks

| | Category | Check | Score | Detail |
|---|---|---|---|---|
| ✓ | build | npm scripts | 100% | all present |
| ✓ | build | stack: Phaser 3 + TypeScript + Vite | 100% | phaser, @playwright/test, typescript, vite |
| ✓ | build | TypeScript strict | 100% |  |
| ✓ | build | vite base './' (GitHub Pages) | 100% |  |
| ✗ | build | GitHub Pages deploy workflow | 0% | missing |
| ✓ | build | typecheck passes | 100% |  |
| ✓ | build | production build passes | 100% |  |
| ✓ | performance | first load under 5 MB | 100% | 1.33 MB |
| ✓ | rules | v1 ships no external art/audio files | 100% | none |
| ✓ | rules | tone: no guns, blood or violence words | 100% | clean |
| ✓ | rules | professors only appear by displayName | 100% | Metroman, Prof. Admin Manzur, Prof. Bezout Argminov |
| ✓ | rules | no imitated-accent dialog | 100% |  |
| ✓ | rules | professors cannot be damaged (no damage path to NPCs) | 100% |  |
| ✓ | rules | mute button always available | 100% |  |
| ✗ | rules | CREDITS.md present | 0% |  |
| ~ | data | every t() key exists in en.json | 99% | missing: questCard.components. |
| ✓ | data | no hard-coded player-facing strings in scenes | 100% | none |
| ✓ | data | arena rooms exist as data (src/data/rooms) | 100% | computer_lab, exam_hall, lecture_hall, physics_lab |
| ✓ | data | balance numbers come from enemies.json | 100% |  |
| ✓ | data | no balance literals in Arena | 100% | none |
| ✓ | data | AssetRegistry lets sprites be swapped for files | 100% |  |
| ✓ | data | sounds swappable via the registry too | 100% |  |
| ✗ | plan | Russian and Uzbek text files (same keys) | 0% | missing |
| ✗ | plan | README with how to play | 0% | missing |
| ~ | plan | easter eggs wired in | 50% | 3/6 missing: outOfBounds, floor0, sudoName |
| ✓ | plan | all five hazards implemented | 100% | portal_down, attendance_sheet, eight_am, deadline_wall, wifi_dead |
| ~ | plan | menu features (name, language, credits, share) | 83% | missing: enterName |
| ~ | plan | font covering Latin, Cyrillic and Uzbek (oʻ, gʻ) | 30% | system monospace only |
| ✓ | plan | desktop + 844×390 screenshots in docs/screens | 100% | 4 desktop, 3 phone |
| ✓ | plan | music for every context (data-driven sequencer) | 100% | menu, campus, stage, midterm, final, results, retake |
| ✓ | tests | test suite exists | 100% | 5 spec files |
| ~ | performance | boots to the title screen quickly | 50% | 6185 ms |
| ✓ | campus | every walkable tile reachable from playerStart | 100% | 9236/9236 |
| ✓ | campus | collision grid matches campus.json tile for tile | 100% | 18720/18720 |
| ✓ | campus | player walks on campus | 100% | moved 23 px |
| ✓ | campus | professor NPCs placed from campus.json | 100% |  |
| ✓ | campus | minimap and objective on campus | 100% | Objective: talk to Prof. Admin Manzur |
| ✓ | systems | talking to a professor opens dialog then the portal quest card | 100% | dialog=true quest=true |
| ✓ | systems | accepting the quest unlocks the course | 100% |  |
| ✓ | campus | south gate → north-west building in 20–30 s | 100% | 23.9 s |
| ✓ | campus | Wi-Fi dead zone disables the minimap | 100% |  |
| ✓ | shooter | arena loads with stage from course components | 100% | {"course":"computer_programming","index":0,"type":"ca","hpBudget":800,"total":800} |
| ✓ | shooter | mouse fire spends the 30-shot clip | 100% | clip 23 |
| ✓ | shooter | semicolons damage paper | 100% | 10 hp destroyed |
| ✓ | shooter | empty clip shows error and 'compiling...' reload | 100% |  |
| ✓ | shooter | coffee throw splashes and makes paper soggy | 100% | ammo 3→2, soggy=true |
| ✓ | shooter | dash (all-nighter) bursts the player forward | 100% | 52 px |
| ✓ | shooter | professor assist (H) works once per stage | 100% | sanity 30→70 |
| ✓ | shooter | synthesised sound effects fire | 100% | 11 kinds: ding, shoot, tear, empty, reload, hurt, throw, pickup, splash, hit, dash |
| ✓ | shooter | Deadline counts down | 100% | 42.8→41.7 |
| ✓ | shooter | feel: shake, hit flash, shreds, stains, damage numbers | 100% | shake, setTintFill, explode, stain, floatText |
| ✓ | shooter | enemy behaviours and both bosses | 100% | swarm_chase, chase_and_shoot, onDeath, midterm_plane, phase |
| ✓ | performance | 60 papers on screen hold the frame rate | 100% | idle 36 fps → 37 fps with 68 papers |
| ✓ | performance | 4× CPU throttle (mid-range Android) stays playable | 100% | 31 fps throttled (baseline 36) |
| ✓ | systems | mercy pass in Prof. Admin's course | 100% | {"computer_programming":[70]} |
| ~ | systems | Engineering Physics completes start to finish (scripted player) | 50% | 1/2 stages |
| ✓ | systems | progress survives a reload | 100% |  |
| ✓ | systems | transcript with GPA at the end of the semester | 100% | transcript=true gpa=3 |
| ✗ | plan | language switch works (en / ru / uz) | 0% | [["ru","en"],["uz","en"]] |
| ✓ | touch | canvas fills the 844×390 screen | 100% | 693×390 |
| ✓ | touch | tap to start works on touch | 100% |  |
| ✓ | touch | left-thumb joystick moves the player | 100% | 55 px |
| ✓ | touch | auto-aim + auto-fire on touch | 100% | clip 19 |
| ✓ | touch | coffee, dash and help buttons on screen | 100% | coffee, dash, help |
| ✓ | touch | tapping the coffee button throws coffee | 100% | 3→2 |
| ✓ | touch | no HUD text overflows the screen | 100% | none |
| ✓ | touch | "rotate your phone" screen in portrait | 100% |  |
| ✓ | build | no console errors during probes | 100% | none |
| ~ | tests | Playwright suite passes | 94% | 15/16 passed · failing: Computer Programming can be completed by a scripted invulnerable player |
