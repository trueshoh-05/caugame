/**
 * Scoring categories and their weights in the overall score.
 * Each category score is the weighted pass rate of its checks (see score.mjs), out of 10.
 * Weights follow the priorities in CLAUDE.md: a working, safe, phone-first shooter first;
 * polish and extras after.
 */
export const CATEGORIES = {
  build:       { name: 'Build, tooling & stability', weight: 1.0 },
  tests:       { name: 'Automated tests', weight: 1.25 },
  rules:       { name: 'Hard rules (tone, names, assets)', weight: 1.0 },
  data:        { name: 'Data-driven design', weight: 0.75 },
  shooter:     { name: 'Core shooter & game feel', weight: 1.5 },
  campus:      { name: 'Campus map', weight: 1.0 },
  systems:     { name: 'Course flow & systems', weight: 1.25 },
  touch:       { name: 'Phone-first touch play', weight: 1.25 },
  performance: { name: 'Performance', weight: 0.75 },
  plan:        { name: 'Completeness vs GAME_PLAN (M4–M6)', weight: 1.0 },
};
