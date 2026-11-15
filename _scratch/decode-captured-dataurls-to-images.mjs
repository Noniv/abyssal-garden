// Usage: node decode-captured-dataurls-to-images.mjs <captured.json> <output-directory>
// Turns the JSON written by chrome-capture-poses-and-flight-stills-as-dataurls.js into one image file per
// shot, then builds contact sheets with ffmpeg (poses.jpg: 3x2 grid, flight.jpg: 4x2 grid, each tile 1280 wide).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const [, , jsonPath, outDir] = process.argv;
if (!jsonPath || !outDir) { console.error('usage: node decode-captured-dataurls-to-images.mjs <captured.json> <output-directory>'); process.exit(1); }
let text = readFileSync(jsonPath, 'utf8');
// the tool may wrap the JSON in a markdown code fence
const first = text.indexOf('{'), last = text.lastIndexOf('}');
const data = JSON.parse(text.slice(first, last + 1));
mkdirSync(outDir, { recursive: true });
const names = Object.keys(data.shots).sort();
for (const name of names) {
  const url = data.shots[name], ext = url.startsWith('data:image/png') ? 'png' : 'jpg';
  writeFileSync(join(outDir, `${name}.${ext}`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}
const sheet = (prefix, cols, rows, file) => {
  const list = names.filter((n) => n.startsWith(prefix));
  if (!list.length) return;
  const args = ['-y', '-loglevel', 'error'];
  for (const n of list) args.push('-i', join(outDir, `${n}.${data.shots[n].startsWith('data:image/png') ? 'png' : 'jpg'}`));
  const layout = list.map((_, i) => `${(i % cols) * 1280}_${Math.floor(i / cols) * 720}`).join('|');
  args.push('-filter_complex', list.map((_, i) => `[${i}:v]scale=1280:720[s${i}]`).join(';') + ';' + list.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=${list.length}:layout=${layout}:fill=black[o]`, '-map', '[o]', '-q:v', '3', join(outDir, file));
  execFileSync('ffmpeg', args);
};
sheet('pose', 3, 2, 'sheet-poses.jpg');
sheet('fly', 4, 2, 'sheet-flight.jpg');
console.log(`${data.size}: wrote ${names.length} shots and contact sheets to ${outDir}`);
