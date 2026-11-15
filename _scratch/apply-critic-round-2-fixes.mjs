// One-off edit script: fixes for blind critic round 2 (see test-probe-steps/20261116_1010-critic-round-2/CRITIC_REPORT.md).
import { readFileSync, writeFileSync } from 'node:fs';
const cache = {};
const rd = (f) => cache[f] ??= readFileSync(new URL(f, import.meta.url), 'utf8');
const ed = (f, a, b) => { const s = rd(f); const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${f}: expected one match, found ${n}: ${a.slice(0, 90)}`); cache[f] = s.replace(a, () => b); };
const S = '../source/src/shaders.js', W = '../source/src/world.js', M = '../source/src/main.js', D = '../source/src/dev.js', FW = './new-fish-shader-block.wgsl';
// 1. dark stretches: more fill in shadow, gentler contrast curve
ed(S, `(.55 + .45 * sat(-p.y / 30.)) + vec3f(.006, .019, .034);`, `(.55 + .45 * sat(-p.y / 30.)) + vec3f(.012, .034, .058);`);
ed(S, `let l = mix(l0, l0 * l0 * (3. - 2. * l0), .55);`, `let l = mix(l0, l0 * l0 * (3. - 2. * l0), .4);`);
// 4. kelp in shadow keeps some colour
ed(S, `side(i.wp, n, sat((vv.r - .5) * 4.), z) * .6) * (.3 + .7 * aov);`, `side(i.wp, n, sat((vv.r - .5) * 4.), z) * .6) * (.46 + .54 * aov);`);
// 5. corals keep their full mesh out to 22 m; tube sponges get a rounded lip and a throat
ed(M, `meshes[PROPM[i]], 0, 0, lod ? 6 : 110);`, `meshes[PROPM[i]], 0, 0, lod ? 22 : 110);`);
ed(M, `if (lod) drawCells(r, Wd.props[i].start, Wd.props[i].lo, Wd.props[i].hi, 3, meshes[18 + i], 0, 6, 110);`, `if (lod) drawCells(r, Wd.props[i].start, Wd.props[i].lo, Wd.props[i].hi, 3, meshes[18 + i], 0, 22, 110);`);
{
  const s = rd(W), a = s.indexOf('function meshTubes() {'), b = s.indexOf('// stone whale fluke');
  if (a < 0 || b < a) throw new Error('meshTubes not found');
  cache[W] = s.slice(0, a) + `function meshTubes() {
  rseed(210);
  const m = new Mesh(), N = LV > 1 ? 8 : 14;
  // each tube is rings around a straight leaning axis: up the outside, over a rounded lip, down into a dark throat
  const PR = [[0, 0.8, 0.35], [0.3, 0.86, 0.55], [0.62, 0.95, 0.8], [0.86, 1.06, 1], [0.95, 1.1, 1], [1, 1.02, 1], [1.01, 0.9, 0.8], [0.97, 0.76, 0.4], [0.8, 0.66, 0.12], [0.55, 0.6, 0.04]];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, r0 = rr(0, 0.28), h = rr(0.45, 1.1), rad = rr(0.07, 0.12), lean = rr(0.05, 0.3), ph = rnd() * TAU, rings = [];
    const bx = cos(a) * r0, bz = sin(a) * r0, dx = cos(a) * lean * h, dz = sin(a) * lean * h;
    for (const [t, rf, ao] of PR) { const ring = []; for (let s = 0; s < N; s++) { const an = s / N * TAU, rl = rad * rf * (1 + 0.07 * sin(an * 3 + ph + t * 2)); ring.push(m.v(bx + dx * t + cos(an) * rl, h * t, bz + dz * t + sin(an) * rl, ao)); } rings.push(ring); }
    for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < N; s++) { const s2 = (s + 1) % N; m.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]); }
    const c = m.v(bx + dx * 0.5, h * 0.5, bz + dz * 0.5, 0.02), last = rings[rings.length - 1];
    for (let s = 0; s < N; s++) m.tri(last[s], c, last[(s + 1) % N]);
  }
  return m;
}
` + s.slice(b);
}
// 8. surface: fine ripples no longer punch hard-edged bright patches into the sky
ed(S, `clamp(1. + 3.8 * (s.x * .6 - s.y * .8), .25, 3.)`, `clamp(1. + 2.3 * (s.x * .6 - s.y * .8), .5, 2.2)`);
// 9. hunters: no orange glow on the fins
for (const f of [S, FW]) ed(f, `fc = vec3f(.12, .16, .2); fg = vec3f(1., .8, .2) * .5; ir = .4;`, `fc = mix(vec3f(.1, .14, .2), vec3f(.3, .42, .5), fi); fg = vec3f(.2, .6, .8) * .15; ir = .4;`);
// dev: terrain size, for planning
ed(D, `balls: Wd.BALLS,`, `terrain: [T.nv, T.start[T.start.length - 1]], balls: Wd.BALLS,`);
for (const f in cache) writeFileSync(new URL(f, import.meta.url), cache[f]);
console.log('critic round 2 fixes applied');
