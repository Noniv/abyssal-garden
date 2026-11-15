// One-off edit script: writes the tuned flight look-at targets (found live with chrome-turn-flight-lookat-targets.js,
// TURNS = [[2,14,0],[3,30,1],[4,14,3],[7,20,1],[8,26,0],[15,26,1],[16,10,0],[18,40,2],[19,22,1]]) into main.js. Positions
// are unchanged. Also limits how steeply fish pitch.
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('../source/src/main.js', import.meta.url); let s = readFileSync(p, 'utf8');
const a = s.indexOf('const FLY = new Float32Array(['), b = s.indexOf(']);', a);
if (a < 0 || b < 0) throw new Error('FLY not found');
const rows = `
  10, -42.2, 7, -9, -31, -10,
  7.5, -41.8, 5.5, -10, -31, -12,
  9, -40.5, 18, 11, -37, 43.2,
  22, -39.2, 40, 42, -35, 57.3,
  38, -39.2, 46, 63.2, -24, 23.4,
  50, -40.4, 35, 58, -24, 8,
  55, -39, 20, 60, -18, -10,
  58, -34, -12, 57.5, -25, -63.3,
  50, -30, -44, 29.8, -26, -93.9,
  30, -30, -70, 4, -28, -90,
  12, -38.5, -62, 6, -27, -90,
  -4, -36.5, -70, 0, -14, -100,
  -16, -37, -84, 0, -22, -108,
  -29, -38, -90, -44, -34, -60,
  -41, -38, -70, -56, -34, -40,
  -53, -38, -50, -72.4, -33, -26.1,
  -58, -38, -28, -64.8, -32, -0.8,
  -57, -38, -10, -60, -30, 16,
  -60, -38, 10, -71.6, -34, 39.4,
  -52, -37, 36, -25.3, -34, 55.4,
  -22, -38, 43, 4, -38, 52,
  -6, -39.2, 44.5, 4, -37, 70,
  3, -40.6, 53, 3, -35, 84,
  3, -41.5, 62, 1, -30, 100,
  4, -39, 76, 3, -22, 100,
`;
if (rows.trim().split('\n').length !== 25) throw new Error('expected 25 control points');
s = s.slice(0, a) + 'const FLY = new Float32Array([' + rows + s.slice(b);
s = s.replace(`// 60 s camera path (position + look-at, Catmull-Rom): the world generator keeps it clear, dev.js flies along it`,
  `// 60 s camera path (position + look-at, Catmull-Rom): the world generator keeps it clear, dev.js flies along it.\n// The look-at points keep the camera's eye on open water and reef where the path runs beside a rock wall.`);
writeFileSync(p, s);
for (const f of ['../source/src/shaders.js', './new-fish-shader-block.wgsl']) {
  const q = new URL(f, import.meta.url); let t = readFileSync(q, 'utf8'); const o = `  v.y *= .6;\n`;
  if (t.split(o).length !== 2) throw new Error('pitch line not found in ' + f);
  writeFileSync(q, t.replace(o, `  // fish swim close to level: the climb or dive is at most a third of the forward speed\n  { let hl = length(v.xz) + .05; v.y = clamp(v.y * .6, -.33 * hl, .33 * hl); }\n`));
}
console.log('ok');
