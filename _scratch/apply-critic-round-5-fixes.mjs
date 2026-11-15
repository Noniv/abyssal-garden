// One-off edit script: fixes for blind critic round 5 (flight framing).
import { readFileSync, writeFileSync } from 'node:fs';
const cache = {};
const rd = (f) => cache[f] ??= readFileSync(new URL(f, import.meta.url), 'utf8');
const ed = (f, a, b) => { const s = rd(f); const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${f}: expected one match, found ${n}: ${a.slice(0, 90)}`); cache[f] = s.replace(a, () => b); };
const S = '../source/src/shaders.js', W = '../source/src/world.js', M = '../source/src/main.js';
// 1. a blade near the lens narrows evenly along its whole length (by the camera's distance to the blade as a line),
//    instead of being pinched to a thread at whichever vertex is closest
ed(S, `* ss(.6, 2.2, distance(c, g.cam.xyz)) * ss(len * 1.1 + .5,`, `* ss(.9, 2.6, length(g.cam.xyz - i.a.xyz - d * clamp(dot(g.cam.xyz - i.a.xyz, d), 0., len))) * ss(len * 1.1 + .5,`);
// 2. rocks keep clear of the flight path: floating boulders (they had no check), ground rocks and large chunks by their size
ed(W, `    if (Dw(x, y, z) > -sc) continue;
    const bob = rr(0.12, 0.4), sd = rnd();`, `    if (Dw(x, y, z) > -sc || nearFly(x, min(y, -2 - sc), z, sc + 4.5)) continue;
    const bob = rr(0.12, 0.4), sd = rnd();`);
ed(W, `    const k = pickV(); if (T.wn[k + 1] < 0.7 || hypot(T.wp[k], T.wp[k + 2]) > 170 || nearFly(T.wp[k], T.wp[k + 1], T.wp[k + 2], 6)) continue;
    const sc = rr(0.25, 1.3) * (rnd() < 0.1 ? 2 : 1);`, `    const k = pickV(), sc = rr(0.25, 1.3) * (rnd() < 0.1 ? 2 : 1); if (T.wn[k + 1] < 0.7 || hypot(T.wp[k], T.wp[k + 2]) > 170 || nearFly(T.wp[k], T.wp[k + 1], T.wp[k + 2], 6 + sc * 2)) continue;`);
ed(W, `    if (hypot(x, z) > 172 || y > -3 || (ny > 0.8 && rnd() < 0.6) || nearFly(x, y, z, 3.5)) continue;
    const sc = (0.35 + 2.1 * pow(rnd(), 2.6)) * (ny > 0.8 ? 0.5 : 1), q = qRand();`, `    const sc = (0.35 + 2.1 * pow(rnd(), 2.6)) * (ny > 0.8 ? 0.5 : 1), q = qRand();
    if (hypot(x, z) > 172 || y > -3 || (ny > 0.8 && rnd() < 0.6) || nearFly(x, y, z, 3.5 + sc * 1.5)) continue;`);
// 3. the path rises where it skimmed the ground; the camera looks past the arch pillar
ed(M, `  9, -40.5, 18, 11, -37, 43.2,
  22, -39.2, 40, 42, -35, 57.3,
  38, -39.2, 46, 63.2, -24, 23.4,
  50, -40.4, 35, 58, -24, 8,`, `  9, -39.3, 18, 11, -37, 43.2,
  22, -37.6, 40, 42, -35, 57.3,
  38, -37.4, 46, 63.2, -24, 23.4,
  50, -38.8, 35, 58, -24, 8,`);
ed(M, `  -22, -38, 43, 4, -38, 52,`, `  -22, -38, 43, 1, -37, 58,`);
// lamp a little gentler, so close rock is lit without its colours shouting
ed(S, `(.55 / (1. + dist * dist * .07))`, `(.42 / (1. + dist * dist * .07))`);
for (const f in cache) writeFileSync(new URL(f, import.meta.url), cache[f]);
console.log('critic round 5 fixes applied');
