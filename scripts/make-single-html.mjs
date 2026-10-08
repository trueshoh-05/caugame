// Builds the whole game into ONE self-contained HTML file: dist-single/cau-semester-survivor.html.
// It works when double-clicked (file://) and when uploaded to any static web host.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

execSync('npx tsc --noEmit && npx vite build --config vite.single.config.ts', { stdio: 'inherit' });
const dir = 'dist-single';
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const tags = [...html.matchAll(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g)];
if (tags.length !== 1) throw new Error(`expected one bundle, found ${tags.length}`);
const js = fs.readFileSync(path.join(dir, tags[0][1]), 'utf8').replace(/<\/script/gi, '<\\/script');
html = html.replace(tags[0][0], () => '');
// Inline the bundle at the end of <body> so the game's elements exist when it runs.
html = html.replace('</body>', () => `<script type="module">\n${js}\n</script>\n</body>`);
html = html.replace(/<link rel="modulepreload"[^>]*>\n?/g, '');
const out = path.join(dir, 'cau-semester-survivor.html');
fs.writeFileSync(out, html);
fs.rmSync(path.join(dir, 'assets'), { recursive: true, force: true });
fs.rmSync(path.join(dir, 'index.html'));
console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
