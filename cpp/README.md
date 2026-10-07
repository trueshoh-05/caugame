# C++ game core

The rules and the arena fight of **CAU: Semester Survivor**, written in C++17. Phaser (TypeScript)
stays as the shell: it draws, plays sound, reads input and runs menus, the campus walk and saving.
Everything that decides what *happens* in a fight runs here.

| File | What it does |
|---|---|
| `src/json.*` | A small JSON reader (no third-party code) for the game's data files |
| `src/data.*` | Loads `src/data/*.json`: balance, courses, professors, rooms, campus |
| `src/rules.*` | Stages from grade components and `stageSizing`, scores, letters, GPA, credits, mercy pass, the `{tic}` dialog insertion |
| `src/campus.*` | Campus collision grid, building flood-fill from each `seed`, BFS reachability, walk time |
| `src/arena.*` | The fight: player movement and dash, semicolons and reloads, coffee splash and soggy, every paper behaviour, mid-term and final bosses, Deadline wall, pickups, attendance and portal-down hazards, professor assists, scoring |
| `src/rng.hpp` | Deterministic random numbers (seeded), so fights replay exactly in tests |
| `src/bindings.cpp` | The JavaScript API (Emscripten embind) |
| `tests/tests.cpp` | Native tests, including a scripted player clearing every stage of every course |

All numbers and text still come from `src/data/`, shared with the web game; nothing is duplicated.

## How it fits together

```
 Phaser scene (src/scenes/Arena.ts)            C++ core (WebAssembly)
 ─────────────────────────────────            ──────────────────────
 keyboard / mouse / touch ── input ────────▶  ArenaSim::step(dt, input)
 draw sprites  ◀──────── positions (typed arrays) ─┤
 sounds, shake, text  ◀── events ("sfx", "float", "toast", "bossPhase", "ended", ...)
```

The scene never decides game rules; it only renders. With `?core=ts` in the URL (or if the
WebAssembly fails to load) the game runs the original TypeScript arena instead.

## Build and test

Native tests (any C++17 compiler + CMake):

```bash
npm run test:core
# or: cmake -S cpp -B cpp/build && cmake --build cpp/build && ./cpp/build/cau_tests
```

WebAssembly (needs the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html)):

```bash
source /path/to/emsdk/emsdk_env.sh
npm run build:core        # writes src/core/generated/cau_core.mjs
```

The generated file is committed, so `npm run dev` works without Emscripten installed.
Rebuild and commit it whenever you change C++; CI (`.github/workflows/cpp.yml`) runs the native
tests and fails if the committed build no longer matches the C++ source
(`scripts/core-fingerprint.mjs` compares stage plans and seeded fights).
