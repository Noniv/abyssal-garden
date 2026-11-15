// One-off edit script: fixes for blind critic round 3 (see test-probe-steps/20261116_1040-critic-round-3/CRITIC_REPORT.md).
import { readFileSync, writeFileSync } from 'node:fs';
const cache = {};
const rd = (f) => cache[f] ??= readFileSync(new URL(f, import.meta.url), 'utf8');
const ed = (f, a, b) => { const s = rd(f); const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${f}: expected one match, found ${n}: ${a.slice(0, 90)}`); cache[f] = s.replace(a, () => b); };
const S = '../source/src/shaders.js', W = '../source/src/world.js', M = '../source/src/main.js', FW = './new-fish-shader-block.wgsl';
const fish = (a, b) => { ed(S, a, b); ed(FW, a, b); };
// 1. diver's lamp: a soft white light at the camera for rock, coral and sponges within a few metres
ed(S, `  var c = alb * (dl + am) + emi + alb * flu * dot(dl + am, vec3f(.1, .5, .5));`,
  `  var c = alb * (dl + am) + emi + alb * flu * dot(dl + am, vec3f(.1, .5, .5));
  // the diver's lamp: what the camera passes closely keeps its form and its true colours
  c += alb * vec3f(1., .97, .9) * (.55 / (1. + dist * dist * .07)) * (.25 + .75 * sat(dot(N, V))) * (.4 + .6 * ao);`);
// 2. purple zone: a short way in and out again
ed(M, `let zt = (66 - sqrt(zx * zx + zz * zz)) / 40;`, `let zt = (50 - sqrt(zx * zx + zz * zz)) / 22;`);
// 3. anemones and soft corals stand well clear of the flight path
ed(W, `const pickNear = (x, z, r, ny) => { for (let i = 0; i < 300000; i++) { const k = pickV(); if (hypot(T.wp[k] - x, T.wp[k + 2] - z) < r && T.wn[k + 1] >= ny && T.wp[k + 1] < -13 && !nearFly(T.wp[k], T.wp[k + 1], T.wp[k + 2], 2)) return k; } return -1; };`,
  `const pickNear = (x, z, r, ny, clear = 3.5) => { for (let i = 0; i < 300000; i++) { const k = pickV(); if (hypot(T.wp[k] - x, T.wp[k + 2] - z) < r && T.wn[k + 1] >= ny && T.wp[k + 1] < -13 && !nearFly(T.wp[k], T.wp[k + 1], T.wp[k + 2], clear)) return k; } return -1; };`);
ed(W, `const k = pickNear(g[0], g[1], g[2] + 1, 0.75); if (k >= 0) anemone(k, rr(1.1, 2.1)); }`, `const k = pickNear(g[0], g[1], g[2] + 1, 0.75, 6); if (k >= 0) anemone(k, rr(1.1, 2.1)); }`);
// 19. clownfish stay in their anemone: hovering fish take a wander scale (c.z)
fish(`sin(t * (.45 + h.z) + s * 23.)) * (.25 + .08 * R);`, `sin(t * (.45 + h.z) + s * 23.)) * (.25 + .08 * R) * c.z;`);
ed(W, `fishAdd(1, p[0], p[1], p[2], c[2], 0, 0.24, ph, rnd() < 0.25 ? 2 : 1, 1, 0, rnd() * 0.04);`, `fishAdd(1, p[0], p[1], p[2], c[2], 0, 0.24, ph, rnd() < 0.25 ? 2 : 1, 1, 1, rnd() * 0.04);`);
ed(W, `fishAdd(4, a[0], a[1], a[2], 0.55 * a[3], 0, rr(0.3, 0.42), ph, 5, 1, 0, rnd() * 0.3);`, `fishAdd(4, a[0], a[1] - 0.12 * a[3], a[2], 0.34 * a[3], 0, rr(0.3, 0.42), ph, 5, 1, 0.45, rnd() * 0.3);`);
// 4. hunters: darker, and the followers fan out instead of trailing in a line; sun glitter no longer clips
fish(`return hunter(a, b.w, c.z, t - c.w * .45) + (h - .5) * vec3f(1.6, 1., 1.6) * step(.01, c.w);`, `return hunter(a, b.w, c.z, t - c.w * .3) + (h - .5) * vec3f(5., 3., 5.) * step(.01, c.w);`);
fish(`alb = mix(vec3f(.62, .7, .78), vec3f(.05, .12, .22), ss(0., .05, y));`, `alb = mix(vec3f(.4, .47, .55), vec3f(.02, .06, .13), ss(-.02, .05, y));`);
ed(S, `pow(sd, 500.) * 12. + pow(sd, 4000.) * 70.)`, `pow(sd, 500.) * 12. + pow(sd, 4000.) * 22.)`);
// 8. reef fish: more form shading, less flat ambient
fish(`+ amb(i.wp, n, vv.g, z) * (.45 + .75 * sat((vv.r - .5) * 2.7)));`, `+ amb(i.wp, n, vv.g, z) * (.3 + .6 * sat((vv.r - .5) * 2.7)) * (.6 + .4 * sat(n.y * .5 + .5 + ndl * .5)));`);
for (const f in cache) writeFileSync(new URL(f, import.meta.url), cache[f]);
console.log('critic round 3 fixes applied');
