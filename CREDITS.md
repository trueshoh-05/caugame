# Credits

## Version 1: no external assets

Every sprite in the game is a pixel grid written in code (`src/art/`), every sound effect is
synthesised at runtime with the Web Audio API (`src/systems/Audio.ts`), and the music is a
small step sequencer playing patterns from `src/data/music.json`. The game ships no image,
audio or font files.

| What | Source | Licence |
|---|---|---|
| Colour palette | [Endesga 32](https://lospec.com/palette-list/endesga-32) by Endesga | Free to use (Lospec palette) |
| Game engine | [Phaser 3](https://phaser.io) | MIT |
| Build tool | [Vite](https://vitejs.dev) | MIT |
| C++ to WebAssembly compiler (build-time only) | [Emscripten](https://emscripten.org) | MIT / University of Illinois NCSA |
| Sprites, tiles, paper enemies, professors | Original pixel grids in `src/art/` | Part of this project |
| Sound effects and music | Synthesised in code | Part of this project |
| Campus layout | Traced from the official CAU 2D campus plan (`reference/`) | Used for a student project |

"MacCoffee" and "Nescafe" appear as text only; the sachet and cup drawings are original and carry no logos.
There is no CAU logo in the game.

## Adding assets later

Anything added later must be CC0 or CC-BY and listed in the table above, with author, link and licence.
Register it in `src/systems/AssetRegistry.ts` under the key it replaces; game code does not change.
