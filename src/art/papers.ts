import { MINI_FONT } from './sprites';

/**
 * Paper enemies are generated as pixel grids (same format as sprites.ts) so each
 * course skin gets its own drawing of every paper type: code for Programming,
 * integrals for Calculus, free-body arrows for Physics.
 */
class Grid {
  px: string[][];
  constructor(public w: number, public h: number) { this.px = Array.from({ length: h }, () => new Array(w).fill('.')); }
  set(x: number, y: number, c: string): void { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c; }
  rect(x: number, y: number, w: number, h: number, c: string): void { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  frame(x: number, y: number, w: number, h: number, c: string): void {
    for (let i = 0; i < w; i++) { this.set(x + i, y, c); this.set(x + i, y + h - 1, c); }
    for (let j = 0; j < h; j++) { this.set(x, y + j, c); this.set(x + w - 1, y + j, c); }
  }
  stamp(x: number, y: number, rows: string[], c: string): void {
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'x') this.set(x + i, y + j, c); }));
  }
  rows(): string[] { return this.px.map((r) => r.join('')); }
}

const GLYPH: Record<string, { rows: string[]; c: string }> = {
  code:    { rows: ['x...x', '.x.x.', 'x...x', '.....', 'xxxxx'], c: 'B' },   // >< and an underline: compiler output
  maths:   { rows: ['..xx.', '..x..', '..x..', '..x..', '.xx..'], c: 'b' },   // integral sign
  physics: { rows: ['..x..', '.xxx.', '..x..', 'x.x.x', '..x..'], c: 'p' },   // free-body arrows
};
const LINE_C: Record<string, string> = { code: 'R', maths: 'b', physics: 'p' };

function face(g: Grid, cx: number, eyeY: number, spread: number, big = false): void {
  // Angry eyebrows, eyes, red-pen teeth.
  const s = big ? 2 : 1;
  for (const dir of [-1, 1]) {
    const ex = cx + dir * spread;
    g.rect(ex - (dir < 0 ? s : 0), eyeY, s, s + (big ? 1 : 0), 'k');
    // eyebrow slants down toward the middle
    g.set(ex - dir * 1, eyeY - 2, 'k');
    g.set(ex, eyeY - 2 + (dir < 0 ? 0 : 0), 'k');
    g.set(ex + dir * 1, eyeY - 3, 'k');
    if (big) { g.set(ex - dir * 2, eyeY - 2, 'k'); g.set(ex + dir * 2, eyeY - 4, 'k'); }
  }
  const mw = spread * 2 + 1;
  const mx = cx - spread;
  const my = eyeY + (big ? 5 : 3);
  g.rect(mx, my, mw, big ? 4 : 3, 'R');
  for (let i = 1; i < mw - 1; i += 2) { g.set(mx + i, my + (big ? 1 : 1), 'w'); if (big) g.set(mx + i, my + 2, 'w'); }
}

function sheet(g: Grid, x: number, y: number, w: number, h: number, fold = 3): void {
  g.rect(x, y, w, h, 'w');
  g.frame(x, y, w, h, 'g');
  for (let i = 0; i < fold; i++) for (let j = 0; j <= i; j++) g.set(x + w - fold + i, y + j, '.');
  for (let i = 0; i < fold; i++) { g.set(x + w - fold - 1 + i, y + i, 'g'); g.set(x + w - fold + i, y + i + 1, 'G'); }
  g.set(x + w - 1, y + fold, 'g');
}

function lines(g: Grid, x: number, y: number, w: number, n: number, c: string): void {
  for (let k = 0; k < n; k++) for (let i = 0; i < w; i++) if ((i + k) % 5 !== 4) g.set(x + i, y + k * 2, c);
}

export function paperGrid(kind: string, skin: string): string[] {
  const glyph = GLYPH[skin] ?? GLYPH.code;
  const lc = LINE_C[skin] ?? 'G';
  let g: Grid;
  switch (kind) {
    case 'quiz': {
      g = new Grid(10, 12); sheet(g, 0, 0, 10, 12, 2);
      face(g, 4, 4, 2); lines(g, 2, 9, 6, 1, lc); break;
    }
    case 'loose_page': {
      g = new Grid(10, 12); sheet(g, 0, 1, 10, 11, 2);
      for (let i = 0; i < 10; i += 2) g.set(i, 1, '.');  // torn top edge
      face(g, 4, 5, 2); break;
    }
    case 'homework': {
      g = new Grid(14, 16); sheet(g, 0, 0, 14, 16, 3);
      face(g, 6, 5, 3); lines(g, 2, 11, 10, 2, lc); break;
    }
    case 'lab_report': {
      g = new Grid(17, 19);
      sheet(g, 2, 2, 15, 17, 0); sheet(g, 1, 1, 15, 17, 0); sheet(g, 0, 0, 15, 17, 3);
      face(g, 7, 5, 3); g.stamp(5, 11, glyph.rows, glyph.c); lines(g, 2, 15, 11, 1, lc); break;
    }
    case 'project': {
      g = new Grid(19, 21);
      sheet(g, 3, 3, 16, 18, 0); sheet(g, 2, 2, 16, 18, 0); sheet(g, 1, 1, 16, 18, 0); sheet(g, 0, 0, 16, 18, 3);
      g.rect(2, 1, 3, 1, 'N'); g.set(2, 2, 'N'); g.set(4, 2, 'N');           // staple
      face(g, 8, 6, 3); g.stamp(6, 12, glyph.rows, glyph.c); break;
    }
    case 'group_project': {
      g = new Grid(28, 28);
      for (let k = 4; k >= 0; k--) sheet(g, k, k, 24, 24, k === 0 ? 4 : 0);
      for (const sx of [2, 10, 17]) { g.rect(sx, 1, 4, 1, 'N'); g.set(sx, 2, 'N'); g.set(sx + 3, 2, 'N'); }
      face(g, 11, 8, 5, true); g.stamp(4, 17, glyph.rows, glyph.c); g.stamp(14, 17, glyph.rows, glyph.c);
      break;
    }
    case 'midterm_paper': {
      g = new Grid(40, 46); sheet(g, 0, 0, 40, 46, 6);
      g.rect(3, 3, 28, 4, lc === 'R' ? 'B' : lc);                              // title band
      face(g, 19, 13, 7, true);
      const letters = ['A', 'B', 'C', 'D'];
      letters.forEach((L, i) => {
        const y = 25 + i * 5;
        g.frame(4, y, 5, 5, 'g'); if (i === 2) g.rect(5, y + 1, 3, 3, 'R');
        g.stamp(11, y, MINI_FONT[L], 'k'); lines(g, 16, y + 2, 18, 1, 'G');
      });
      g.stamp(30, 36, glyph.rows, glyph.c);
      break;
    }
    case 'midterm_plane': {
      g = new Grid(44, 24);
      for (let y = 0; y < 24; y++) {
        const half = Math.round((y / 23) * 21);
        for (let x = 22 - half; x <= 22 + half; x++) g.set(x, y, y > 18 ? 'G' : 'w');
        g.set(22 - half, y, 'g'); g.set(22 + half, y, 'g');
      }
      for (let y = 2; y < 24; y++) g.set(22, y, 'g');
      face(g, 22, 12, 5, true);
      break;
    }
    case 'final_exam':
    default: {
      g = new Grid(56, 62);
      g.rect(4, 4, 52, 58, 'G');                                               // page block
      g.rect(0, 0, 52, 58, 'b'); g.frame(0, 0, 52, 58, 'K');
      g.rect(2, 2, 2, 54, 'n');                                                // spine
      g.rect(10, 6, 34, 10, 'w'); g.frame(10, 6, 34, 10, 'g');
      lines(g, 13, 9, 28, 3, 'g');
      g.rect(8, 21, 38, 26, 'w'); g.frame(8, 21, 38, 26, 'g');
      face(g, 26, 29, 8, true);
      g.stamp(11, 41, glyph.rows, glyph.c); g.stamp(38, 41, glyph.rows, glyph.c);
      g.stamp(20, 50, MINI_FONT.F, 'R'); g.set(24, 52, 'R'); g.set(24, 53, 'R');
      break;
    }
  }
  return g.rows();
}

export const PAPER_KINDS = ['quiz', 'homework', 'lab_report', 'loose_page', 'project', 'group_project', 'midterm_paper', 'midterm_plane', 'final_exam'];

export function bubbleGrid(letter: string): string[] {
  const g = new Grid(10, 10);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const d = Math.hypot(x - 4.5, y - 4.5);
    if (d < 4.6) g.set(x, y, d > 3.6 ? 'R' : 'w');
  }
  g.stamp(4, 3, MINI_FONT[letter], 'k');
  return g.rows();
}
