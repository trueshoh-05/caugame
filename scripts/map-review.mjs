// Usage: node scripts/map-review.mjs  (set CHROMIUM_PATH if Playwright's own Chromium is missing)
// Renders campus.json as a labelled map sheet for review.
import fs from 'node:fs';
import { chromium } from '@playwright/test';
const c = JSON.parse(fs.readFileSync('src/data/campus.json', 'utf8'));
const S = 7; // px per tile
const [W, H] = c.size;
const colors = { '.': '#2b2f45', '#': '#dfe4ee', a: '#a7b0c2', p: '#9aa5b8', d: '#6b7489', P: '#59627a', '=': '#f2c14e', r: '#b3303c', s: '#e4a672', g: '#4f9a4f', t: '#2f6b40', w: '#2a8fd6', f: '#6cc35a', c: '#d77643' };
let rects = '';
c.grid.forEach((row, y) => [...row].forEach((ch, x) => { rects += `<rect x="${x * S}" y="${y * S}" width="${S}" height="${S}" fill="${colors[ch] || '#000'}"/>`; }));
let marks = '', legend = [];
let n = 0;
const label = (x, y, text, fill, kind) => { n++; marks += `<circle cx="${x * S + S / 2}" cy="${y * S + S / 2}" r="9" fill="${fill}" stroke="#000" stroke-width="1.5"/><text x="${x * S + S / 2}" y="${y * S + S / 2 + 4}" font-size="11" font-weight="bold" text-anchor="middle" fill="#fff">${n}</text>`; legend.push(`<tr><td><b>${n}</b></td><td>${kind}</td><td>${text}</td></tr>`); };
const rooms = { computer_lab: 'Computer lab (Computer Programming)', lecture_hall: 'Lecture hall (Calculus)', physics_lab: 'Physics lab (Engineering Physics)', exam_hall: 'Registrar / transcript' };
for (const b of c.buildings) {
  const [x0, y0, x1, y1] = b.bbox;
  marks += `<text x="${((x0 + x1) / 2) * S}" y="${((y0 + y1) / 2) * S}" font-size="13" font-weight="bold" text-anchor="middle" fill="#1b2a5a" stroke="#fff" stroke-width="3" paint-order="stroke">${b.id}</text>`;
  label(b.seed[0], b.seed[1], `<b>${b.id}</b>: ${b.name}`, '#1b2a5a', 'Building');
  for (const d of b.doors) label(d.at[0], d.at[1], `Door of <b>${b.id}</b> (${d.part ?? d.side}) → ${d.leadsTo ? rooms[d.leadsTo] ?? d.leadsTo : 'locked'}`, d.leadsTo ? '#1f8a3b' : '#c0392b', 'Door');
}
const prof = { prof_admin: 'Prof. Admin Manzur (Computer Programming)', prof_bezout: 'Prof. Bezout Argminov (Calculus)', prof_metroman: 'Metroman (Engineering Physics)' };
for (const p of c.npcs) label(p.at[0], p.at[1], prof[p.prof], '#8e44ad', 'Professor');
for (const p of c.pickups) label(p.at[0], p.at[1], p.type === 'food_point' ? 'Canteen / food point' : `Coffee point (${p.gives})`, '#d35400', 'Food/coffee');
for (const g of c.gates) label(g.at[0], g.at[1], g.note ?? g.id, '#000', 'Gate');
for (const z of c.zones) { const [x, y, w, h] = z.rect; marks += `<rect x="${x * S}" y="${y * S}" width="${w * S}" height="${h * S}" fill="none" stroke="#e00" stroke-dasharray="6 4" stroke-width="2"/>`; label(x + 1, y + 1, 'Wi-Fi dead zone (placeholder)', '#e00', 'Zone'); }
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:Arial;background:#fff;display:flex;gap:16px;padding:12px">
<svg width="${W * S}" height="${H * S}" xmlns="http://www.w3.org/2000/svg">${rects}${marks}</svg>
<div style="font-size:13px;max-width:560px"><h2 style="margin:0 0 8px">CAU map in the game — what is where</h2>
<p style="margin:0 0 8px">Grid traced from the official plan (north is up after the 41.8° turn; south gate at the bottom). Tell me the numbers that are wrong and what they really are.</p>
<table style="border-collapse:collapse" cellpadding="3" border="1">${legend.join('')}</table>
<p><span style="background:#f2c14e">&nbsp;&nbsp;</span> guide paths &nbsp; <span style="background:#2a8fd6">&nbsp;&nbsp;</span> canals &nbsp; <span style="background:#6cc35a">&nbsp;&nbsp;</span> football pitch &nbsp; <span style="background:#d77643">&nbsp;&nbsp;</span> courts &nbsp; <span style="background:#59627a">&nbsp;&nbsp;</span> parking</p></div></body></html>`;
fs.writeFileSync('docs/map-review.html', html);
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await b.newPage({ viewport: { width: W * S + 620, height: H * S + 30 } });
await p.goto('file://' + process.cwd() + '/docs/map-review.html');
await p.screenshot({ path: 'docs/map-review.png', fullPage: true });
await b.close();
fs.rmSync('docs/map-review.html');
console.log('labels', n);
