// One-off edit script: near kelp and foliage blades stop reading as flat paper. (1) the shading normal is tilted
// across the blade's width, so each blade shades like a gently curved surface; (2) blades within 9 m get 13 rows
// instead of 9, for smoother outlines and bends.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL(f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
const S = '../source/src/shaders.js', M = '../source/src/main.js';
ed(S, `  let ca = caus2(i.wp, dist);
  var n = normalize(i.n); if (!ff) { n = -n; }
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let z = zone(i.wp);
  let lt = textureSample(tD, sR, vec2f(i.uv.x * .13`,
  `  let ca = caus2(i.wp, dist);
  // which way "across the blade" points in the world, from how the blade coordinate changes over the screen
  let gu = dpdx(i.wp) * dpdx(i.uv.x) + dpdy(i.wp) * dpdy(i.uv.x);
  var n = normalize(i.n); if (!ff) { n = -n; }
  // the blade is drawn flat but shaded as if gently curved across its width
  n = normalize(n + gu / max(length(gu), 1e-9) * (i.uv.x * .55));
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let z = zone(i.wp);
  let lt = textureSample(tD, sR, vec2f(i.uv.x * .13`);
ed(M, `const pLeaf5 = scenePipe(`, `const pLeafN = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 13 } });
const pLeaf5 = scenePipe(`);
ed(M, `  r.setPipeline(pLeaf); r.setVertexBuffer(0, ibBig); drawCells(r, Wd.big.start, Wd.big.lo, Wd.big.hi, 5, false, 18, 0, 24);`,
  `  r.setPipeline(pLeafN); r.setVertexBuffer(0, ibBig); drawCells(r, Wd.big.start, Wd.big.lo, Wd.big.hi, 5, false, 26, 0, 9);
  r.setPipeline(pLeaf); drawCells(r, Wd.big.start, Wd.big.lo, Wd.big.hi, 5, false, 18, 9, 24);`);
console.log('ok');
