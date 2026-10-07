# CAU: Semester Survivor

A free browser game for computer science students at **Central Asian University (CAU), Tashkent**.
You are a student. Your assignments have come alive as angry paper. Your weapon is your laptop:
it fires C++'s Semicolons, and you can throw coffee. Professors hand out the quests and help;
they can never be hit.

One semester is three courses — Computer Programming, Calculus for Engineers and Engineering
Physics — played on a tile-for-tile map of the real campus. Each course follows its real grade
components; the bigger the component, the bigger the fight. A semester takes 15–25 minutes and
ends with a transcript and a GPA you can share.

## How to play

| | Desktop | Phone (landscape) |
|---|---|---|
| Move | WASD or arrow keys | Left thumb: floating joystick |
| Fire semicolons | Aim with the mouse, hold left click | Automatic, aimed at the nearest paper |
| Throw coffee | Right click or Q | Coffee button |
| Dash ("all-nighter") | Space | Dash button |
| Talk / enter a door | E | Tap the button that appears |
| Call the professor (once per stage) | H | Help button |
| Reload early | R | — |

1. Walk across campus to a professor (the one with the **!**) and talk to them.
2. Read the quest card — it looks just like the course page on the portal ("No data" and all) — and accept.
3. Walk into the course's room. Each grade component is one stage: clear the wave or beat the boss before the **23:59** wall reaches you, then step into **Submit**.
4. Finish all three courses, then visit the registrar (north-west building) for your transcript.

Tips: soggy paper is slow paper. Nescafe is saved for bosses automatically. Prof. Admin Manzur never fails anyone.

## Development

```bash
npm install
npm run dev       # dev server with the debug handle (window.__game) and the M plan overlay
npm run build     # type-check and build to dist/
npm run preview   # serve the build
npm test          # Playwright tests (Chromium; saves screenshots to docs/screens/)
npm run score     # run the scorer (see below)
```

**The game core is C++.** The rules and the arena fight live in [`cpp/`](cpp/README.md) (C++17),
compiled to WebAssembly; Phaser draws what the C++ simulation reports. `npm run test:core` runs
the native C++ tests, `npm run build:core` rebuilds the WebAssembly (needs Emscripten).
Add `?core=ts` to the URL to play the original TypeScript version of the arena.
There is also a **terminal edition**: one C++ file, no dependencies — see [`cpp/standalone/`](cpp/standalone/README.md).

Stack: C++17 core (WebAssembly), Phaser 3, TypeScript (strict), Vite. No backend, no asset files: sprites are pixel grids in
`src/art/`, sound is synthesised in `src/systems/Audio.ts`, music patterns live in `src/data/music.json`.
All content is data: `src/data/campus.json` (map), `courses.json`, `professors.json`, `enemies.json`
(every balance number), `rooms/*.json` (arenas) and `text/<lang>.json` (English, Russian, Uzbek).
Adding a professor, course, enemy or room needs no new code.

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## The scorer

`scorer/score.mjs` rates the game out of 10 against `CLAUDE.md` and `GAME_PLAN.md`:
it analyses the repository, serves the production build and plays it in headless Chromium
(desktop and a 844×390 touch phone), and runs the Playwright suite. It writes a report with
prioritised feedback to `scorer/reports/gen-N.md` and a row to `scorer/HISTORY.md`.
See `scorer/README.md` for the criteria and the improvement log.

## Credits

See [CREDITS.md](CREDITS.md). Professors appear only under their in-game names.
