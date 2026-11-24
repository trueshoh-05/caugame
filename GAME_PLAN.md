# CAU Campus Shooter — Game Plan (v4)

University: **Central Asian University (CAU), Tashkent**. Audience: CAU computer science students.
Working title: **CAU: Semester Survivor** (alternatives: Deadline at CAU, GPA Wars).

This file is the design. `CLAUDE.md` is the build instructions for the coding session. The content itself lives in `src/data/`.

---

## 1. The game in one paragraph

You are a CAU computer science student. The campus is the map. Professors hand you assignments, the assignments come alive as angry paper, and you shoot them with your laptop. Each course follows its real grade components from the CAU portal. Professors never fight you; they give the quest in their own way of talking, give tips, and can be called for help. One semester is three courses, takes 15–25 minutes, and ends with a transcript and a GPA.

**Three design pillars:**
1. **"That's so CAU."** Every screen has at least one thing only CAU students will recognise.
2. **Pure shooter.** Move, shoot paper, dodge. No puzzles. The humour lives in names, dialog and the interface.
3. **Two-minute stages.** Playable on a phone in the canteen queue.

## 2. Decisions made

| Decision | Choice |
|---|---|
| Platform | Website, no install, hosted free on GitHub Pages |
| View | Top-down ¾ view (Zelda / Stardew style) |
| Engine | Phaser 3 + TypeScript + Vite |
| Map | A tile grid (`campus.json`) traced from the official CAU plan |
| Weapon | One weapon: the laptop. Ammo: C++'s Semicolon and coffee |
| Enemies | Paper only |
| Languages | English first, then Russian and Uzbek |
| Backend | None for v1; progress saved in the browser |
| Devices | Phone first (landscape), desktop also |
| Art and sound in v1 | Pixel sprites and sounds generated in code, no asset files; replaceable later |

**Tone rule:** a shooter on a real campus must be obviously harmless. Laptop, not gun. Paper, not people. Professors and other students cannot be hit.

## 3. Core loop and the three courses

```
Campus → talk to a professor (quest card) → enter the room (arena)
   → one stage per grade component of that course
   → course grade → back to campus → next professor
End of semester → transcript + GPA → share
```

| Course | Professor | Arena | Stages (real weights) |
|---|---|---|---|
| Computer Programming | Prof. Admin Manzur | Computer lab | CA 20 → Mid-term 10 → Projects 20 → Final 50 |
| Calculus for Engineers | Prof. Bezout Argminov | Lecture hall | CA 20 → Mid-term 30 → Final 50 *(placeholder weights)* |
| Engineering Physics | Metroman | Physics lab | Mid-term 40 → Final 60 |

- **Weight = size of the fight.** Each course has 4,000 points of enemy health; a stage gets its weight's share. The Computer Programming mid-term is a 400-health mini-boss; the Engineering Physics final is a 2,400-health monster with no warm-up before it.
- **Deadline** per stage = 20 s + 1.5 s per weight point (35 s for a 10% mid-term, 110 s for a 60% final). A red wall marked 23:59 crosses the room. Finishing late costs 10 marks.
- **Stage score:** 70 for clearing it, up to +20 for Sanity left, +10 for beating the Deadline.
- **Fail** (Sanity hits 0) = **Retake** — except in Prof. Admin's course, where he passes you with a C.
- **Course grade** = stage scores × weights → letter → GPA. One credit per course percent, spent on laptop upgrades.

**Quest card = the portal page.** The quest is shown as a card laid out like the real CAU course page. For Computer Programming and Calculus every field reads **"No data"** except the grade components. For Engineering Physics it shows the real description, the Feynman Lectures, and "Guided Independent Study: 70 hours".

## 4. Controls

| | Desktop | Phone (landscape) |
|---|---|---|
| Move | WASD | Left thumb joystick |
| Fire semicolons | Mouse aim, hold click | Auto-aim at nearest paper, auto-fire |
| Throw coffee | Right click / Q | Coffee button |
| Dash ("all-nighter") | Space | Dash button |
| Talk / enter | E | Tap the bubble |
| Call the professor | H | Help button |

## 5. Enemies: paper

| Enemy | Component | Health | Behaviour |
|---|---|---|---|
| **Pop Quiz** | CA | 10 | Small, fast, swarms |
| **Homework** | CA | 30 | Walks straight at you |
| **Lab Report** | CA | 80 | Slow, thick, flicks staples |
| **Project** | Projects | 150 | Stapled stack; bursts into 4 loose pages |
| **Group Project** | Projects | 600 | Bursts into 8 pages; three teammate NPCs stand beside you doing nothing |
| **Mid-term** | Mid-term | by weight | Folds into a paper plane and dive-bombs; fires rings of A / B / C / D bubbles |
| **Final** | Final | by weight | Giant exam booklet, three phases: red-pen spirals, then "additional answer sheets", then faster and chasing |

**Course skins** (same enemies, different drawings): code and compiler errors for Programming; integral signs and "left as an exercise" for Calculus; free-body diagrams, circuits and unlabelled graphs for Physics.

**Hazards:** the Deadline wall; **Portal down** (exit shows 503 for five seconds at 23:58); **Wi-Fi drop** (minimap and Help stop working in dead zones); **8 a.m. class** (slow until your first coffee); **Attendance sheet** (touch it before it floats away or lose 5 marks).

All numbers are in `src/data/enemies.json`.

## 6. The professors

Names are altered on purpose: close enough that every CAU student knows who it is, different enough that it is clearly a character. Real names never appear in the game or the repository.

### Metroman — Engineering Physics
- **Voice:** the dialog system drops "and whatnot" into his lines automatically (about half of them, never twice in one box).
- **Assist: Time dilation** — freezes the Deadline for 8 seconds.
- **Achievement:** hear "whatnot" 50 times → *Etc. and Whatnot*.
- **Signature item:** laser pointer. His sprite is an original design, not the film character of the same name.
- Sample: "There is no continuous assessment here. Only a mid-term and a final and whatnot."

### Prof. Admin Manzur — Computer Programming
- **Personality rule: mercy pass.** Fail any stage of his course and he passes you with a C instead of a retake.
- **Assist: Stress detected** — restores 40 Sanity. His real research is computer models of emotion and stress detection, so he is the one professor who can literally tell you are stressed.
- **Achievement:** pass his whole course without winning a stage → *Curved*.
- **Signature item:** mug. Office sign: 264, Avicenna Hall.
- Sample (fail): "Oh. Well... you came, and that is what matters. Let's call it a C and move on, yes?"

### Prof. Bezout Argminov — Calculus for Engineers
- **Voice:** a man of few words. Many of his speech bubbles are a formula on a small whiteboard instead of a sentence, and the warm bits come in Uzbek ("Qani, boshladik." / "Barakalla!").
- **Assist: Isometry** — for 5 seconds every paper keeps its distance and cannot come closer. His real research is isometries of Banach spaces.
- **Achievement:** finish his final with full Sanity → *Q.E.D.*
- **Signature item:** whiteboard marker. Office sign: 445, Avicenna Hall.
- Sample (tip): "Do not stand in the corner. A corner is a local minimum."
- **What is deliberately left out:** his accent and his English. The character is written as sharp, brief and kind, with no misspelled or imitated speech. A joke about how a real, named-in-all-but-name lecturer speaks a second language reads as mockery, and it is the fastest way to lose his goodwill and get the game taken down.

Personality rules for Metroman and Prof. Bezout are empty for now. Fill them with a real habit each (always late, "this is trivial", never gives extensions) when you have one students already joke about.

**Before launch:** show each professor their character. One who enjoys the cameo will share the link.

## 7. The laptop and its ammo

| Ammo | What it does |
|---|---|
| **C++'s Semicolon** `;` | Standard shot, unlimited. 30-shot clip, 6 per second. Reload shows "compiling..." for one second. Firing on empty shows `error: expected ';'`. |
| **MacCoffee 3-in-1** | Thrown cup, small splash. Soaked paper goes soggy: half speed for 3 seconds. Start with 3, carry 6. |
| **Nescafe** | Rare. Big splash, double damage. Carry 3. |

- Coffee is found at coffee points on campus and inside arenas. Brand names appear as text; sachet and cup drawings are original, no logos.
- **Healing** is canteen food (+35 Sanity), separate from ammo.
- **Other pickups:** Deadline Extension (freezes the wall 10 s); *The Feynman Lectures* (Physics only: blocks one hit).
- **Upgrades:** SSD (faster reload), More RAM (bigger clip), Bigger mug (wider splash), Dark Mode (cosmetic).

## 8. Graphics and the campus map

### Look
- Drawn at 480×270, scaled up by whole numbers. Tiles 16×16, characters about 16×24, bosses 48–64 px. Palette: Endesga 32 with CAU's colours as accents.
- Paper enemies: white sheets with angry eyes and red-pen teeth. Professors: recognisable by one signature item.
- HUD styled like a code editor: Sanity top left, Deadline top centre, grade top right, clip and coffee bottom right, a terminal line of jokes at the bottom.
- Feel: screen shake, white hit-flash, paper shreds, coffee stains on the floor, damage numbers as "−5%".
- **Version 1 sprites are pixel grids written in code**, so the game needs no image files to run. Hand-drawn art (Aseprite, Piskel) can replace them later one sprite at a time.

### The CAU map
The map is `src/data/campus.json`: a grid of 130 × 144 tiles **traced pixel by pixel from the official 2D campus plan**, so building footprints, gaps and proportions are the real ones. Nothing is compressed or rearranged. `reference/plan_vs_map.png` shows the plan and the map side by side.

- **What counts as CAU** comes from your red line on the 3D render: the car park, the buildings around the central walkway, the sports ground, up to the two long buildings at the north. The stadium and planned buildings further north are left off.
- **The main complex** is the two "twin" wings joined along their south side, wrapped around the tree courtyard, which is open only to the north. The long building to the north is **Event Hall**: a separate building, not connected to the main complex (corrected by a CAU student, Nov 2026).
- **The Architecture and Engineering building** is on the map, west of the main complex, with its inner courtyard and pools. The 3D render shows a lawn there; the 2D plan has the building.
- The real campus sits diagonally on the plan. In the game it is turned 41.8° (measured from the building edges) so walls run straight along the grid and the main walkway runs up the screen. This matches the 3D render's viewpoint: highway at the bottom, east road on the right.
- Crossing the campus from the south gate to the north buildings takes about 25 seconds.

| On the map | Where | Used in the game as |
|---|---|---|
| Architecture and Engineering building | West, large, with courtyard | Computer lab — Programming *(guess)* |
| Event Hall (long building north of the main complex; separate, not academic) | On the central walkway | Locked for now |
| Main complex: east and west wings, south link | Around the tree courtyard | Lecture hall — Calculus, east-wing door *(guess)*; other doors locked |
| East building | Next to the football pitch | Physics lab — Engineering Physics *(guess)* |
| Zigzag building | South of the pitch | Locked for now |
| South building (pyramid roof) | By the main entrance | Locked; food point outside |
| North-west building | North end of the walkway | Exam hall *(guess)* |
| North-east building | By the east gate | Locked for now |
| Two small annex buildings | West of Event Hall | Scenery |

Also on the map: the guide paths; the dark plaza; the canals; the car park with its tree rows; the west lawn; the football pitch and sports courts; the steps beside the south building; the south and east gates.

**Confirmed (Nov 2026):** there is no passage through the south link of the main complex. The guide path ends at the south-link door, and the way to the courtyard is around the building.

Only one building name is confirmed. Tell me the rest (which is Avicenna Hall, where the canteen and library are, which building each course is really taught in) and they change in one place.

**How the game builds it:** the code reads the grid one character per tile, draws walls and roofs around each group of building tiles automatically, and places doors, professors and pickups from the same file. A debug key overlays the real plan on the game map to prove they line up.

## 9. Conversations and languages

- All text is in `src/data/text/en.json` (then `ru.json`, `uz.json` with the same keys). Language picker on the start screen.
- **English first.** Russian and Uzbek come once the English game is fun.
- Professors keep their own voice in every language: "whatnot" stays "whatnot", Prof. Bezout's Uzbek asides stay Uzbek.
- Student NPCs mix all three languages, the way the campus sounds.
- Translate the joke, not the sentence. Drop a joke rather than keep a dead one.
- Font must cover Latin, Cyrillic and Uzbek letters (oʻ, gʻ).
- Writing rules: at most 2 lines per box and 3 boxes before a fight; always skippable; one joke per box; text types out with a blip at a different pitch per professor.
- Already written: quest, tip, mid-fight, assist, win, fail and corridor lines for all three professors; student chatter; loading tips; terminal jokes; hidden jokes (Room 404, "index out of bounds" door, "Floor 0" sign, a student named `undefined`, the Python student with no semicolons).

## 10. Music and sound

| Where | Style |
|---|---|
| Menu / campus | Lo-fi "beats to study to", with a short local-flavoured melody on top |
| CA and Projects stages | Light, bouncy chiptune, ~120 BPM |
| Deadline approaching | The same track, sped up live |
| Mid-term | Tense and sparse, exam-hall clock ticking |
| Final | Full, fast chiptune, ~160 BPM |
| Results | Short graduation fanfare, or a sad little tune for a retake |

- Sound effects: keyboard clack per semicolon, paper tear, coffee splash, sachet tear on pickup, notification ding when an assignment spawns, error buzz on fail.
- Version 1 generates all sound in code (synthesised effects, a small chiptune sequencer). Later, real tracks can be composed in BeepBox or taken from CC0 / CC-BY sources and listed in `CREDITS.md`. No real songs, no sounds lifted from other apps.
- Sound starts after the first tap; a mute button is always visible.

## 11. Project structure

```
caugame/
  CLAUDE.md            build instructions for the coding session
  GAME_PLAN.md         this file
  reference/           2D plan, rotated plan, 3D render, map preview
  src/
    main.ts
    scenes/    Boot, Preload, Menu, Campus, Arena, Dialog, HUD, QuestCard, Results, Transcript
    entities/  Player, Paper, Boss, Projectile, Professor, Pickup
    systems/   Input, MapBuilder, Stages, Dialog, Grades, Save, Audio, Language
    art/       sprites defined as pixel grids
    data/      campus.json, courses.json, professors.json, enemies.json, rooms/, text/
  tests/               Playwright
  .github/workflows/   build and deploy to GitHub Pages
```

## 12. Still open

1. Real building names (only Architecture and Engineering is confirmed), which building each course is taught in, and where the canteen, library, coffee and Wi-Fi dead zones are.
2. Grade components for Calculus for Engineers.
3. CAU's grading scale (percent → letter → GPA points).
4. A real habit each for Metroman and Prof. Bezout, to become their personality rule.
5. The professors' approval of their characters.

None of these block the build; the data files carry marked placeholders.

## 13. Build order

Milestones and acceptance checks are in `CLAUDE.md`:
M0 scaffold and deploy → M1 grey-box shooter → M2 campus map → M3 one full course (Computer Programming) → M4 whole semester → M5 feel and sound → M6 languages and share.

After M3, have five CAU students play while you watch silently. Note where they laugh and where they quit, and adjust before building the rest.

## 14. Risks

- **Scope.** M3 is already a game worth showing. Everything after is extra.
- **Phone performance.** Test on a cheap Android from M1.
- **Consent.** Near-real names make the professors identifiable; their approval matters more, not less.
- **Tone.** Laptop, not gun. Paper, not people. No accent or appearance jokes.
- **Translation.** Three languages triples the text work.
- **Licences.** No logos; any asset added later goes in `CREDITS.md`.
