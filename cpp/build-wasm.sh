#!/usr/bin/env bash
# Build the C++ game core to WebAssembly for the browser.
# Needs the Emscripten SDK (https://emscripten.org/docs/getting_started/downloads.html):
#   source /path/to/emsdk/emsdk_env.sh && ./cpp/build-wasm.sh
# Output: src/core/generated/cau_core.mjs (JavaScript + embedded wasm, committed so the web
# game runs without Emscripten installed).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../src/core/generated"
mkdir -p "$out"
em++ -O2 -std=c++17 -fwasm-exceptions -lembind \
  "$here/src/json.cpp" "$here/src/data.cpp" "$here/src/rules.cpp" "$here/src/campus.cpp" "$here/src/arena.cpp" "$here/src/bindings.cpp" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createCauCore -sSINGLE_FILE=1 \
  -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 \
  -o "$out/cau_core.mjs"
ls -l "$out/cau_core.mjs"
