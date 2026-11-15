// One-off edit script: fixes for blind critic round 1 (see test-probe-steps/20261116_0930-critic-round-1/CRITIC_REPORT.md).
// Each edit must match exactly once. Fish shader edits go to both shaders.js and the scratch WGSL copy.
import { readFileSync, writeFileSync } from 'node:fs';
const cache = {};
const rd = (f) => cache[f] ??= readFileSync(new URL(f, import.meta.url), 'utf8');
const ed = (f, a, b) => { const s = rd(f); const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${f}: expected one match, found ${n}: ${a.slice(0, 90)}`); cache[f] = s.replace(a, () => b); };
const S = '../source/src/shaders.js', W = '../source/src/world.js', M = '../source/src/main.js', D = '../source/src/dev.js', FW = './new-fish-shader-block.wgsl';
const fish = (a, b) => { ed(S, a, b); ed(FW, a, b); };

// ---- 1. fish: keep clear of the camera, darker in enclosed places, less flat glow
fish(`  let P = fpos(i.a, i.b, i.c, t);
  var v =`, `  var P = fpos(i.a, i.b, i.c, t);
  // fish keep their distance from the camera (further for big fish), so none fills the view or gets cut by it
  { let dc = P - g.cam.xyz; let dl = length(dc); P += dc / max(dl, .01) * max(1.2 + 2.6 * i.b.z - dl, 0.); }
  var v =`);
fish(`+ amb(i.wp, n, vv.g, z) * 1.3);
  c += E * pow(sat(dot(n, normalize(V + L))), 24.) * (1.2 + i.sd.z * 3.) * (1. - fi)`, `+ amb(i.wp, n, vv.g, z) * (.45 + .75 * sat((vv.r - .5) * 2.7)));
  c += E * pow(sat(dot(n, normalize(V + L))), 24.) * (1.2 + i.sd.z * 3.) * (1. - fi)`);
fish(`emi = vec3f(.05, .3, 1.) * .18 * (1. - mk);`, `emi = vec3f(.05, .3, 1.) * .05 * (1. - mk);`);
// ---- 10. patterns: irregular spots and a wavy lattice on the triggerfish, softer varied scales on the parrotfish
fish(`      var q = vec2f(x, y) * 9.; q.x += floor(q.y) * .5;
      let sp = ss(.36, .26, length(fract(q) - .5)) * ss(.02, -.04, y);
      let li = (ss(.12, .02, abs(sin(x * 30. + y * 24.))) + ss(.12, .02, abs(sin(x * 30. - y * 24.)))) * ss(.02, .08, y) * ss(.42, .3, x);`,
  `      var q = vec2f(x + .03 * sin(y * 23.), y + .02 * sin(x * 17.)) * 8.; q.x += floor(q.y) * .5;
      let hh = hs(dot(floor(q), vec2f(7.3, 13.1)));
      let sp = ss(.2 + .2 * hh, .12 + .18 * hh, length(fract(q) - .5 - (vec2f(hh, fract(hh * 7.)) - .5) * .4)) * ss(.02, -.04, y);
      let wv = .05 * sin(y * 37. + x * 11.) + .03 * sin(x * 29.);
      let li = ss(.16, .03, abs(sin((x + wv) * 21. + y * 15.))) * ss(.02, .08, y) * ss(.42, .3, x) * (.5 + .5 * sin(x * 13. + 2.));`);
fish(`      var q = vec2f(x, y) * 16.; q.x += floor(q.y) * .5;
      let ed = ss(.36, .5, length(fract(q) - .5));
      let base = mix(vec3f(.08, .8, .72), vec3f(.98, .4, .62), ss(.3, -.3, x + y * .5));
      alb = base * (1. - .5 * ed); emi = base * (1. - ed) * .07;`,
  `      var q = vec2f(x, y) * 19.; q.x += floor(q.y) * .5;
      let ed = ss(.3, .52, length(fract(q) - vec2f(.5, .42)));
      let base = mix(vec3f(.08, .8, .72), vec3f(.98, .4, .62), ss(.3, -.3, x + y * .5 + .12 * sin(y * 14.))) * (.82 + .36 * hs(dot(floor(q), vec2f(3.1, 17.7))));
      alb = base * (1. - .3 * ed); emi = base * (1. - ed) * .04;`);

// ---- 2. sea whips: curved, softly banded instead of black-and-white dashes
ed(S, `  return a.xyz + (d * v + e1 * (sin(v * 3. + s * 20.) * .05 * v) + cur * (.13 * v * v)) * a.w;`,
  `  return a.xyz + (d * v + e1 * (sin(v * 4. + s * 20.) * .13 * v) + e2 * (cos(v * 3.1 + s * 33.) * .1 * v) + cur * (.16 * v * v)) * a.w;`);
ed(S, `    let dots = ss(.55, .9, sin(v * 110.)) * ss(.1, .2, v);
    alb = mix(mix(vec3f(.85, .16, .1), vec3f(1., .6, .1), fract(h * 3.)), vec3f(1., .95, .85), dots); emi = vec3f(1., .8, .55) * dots * .3;`,
  `    let st = mix(vec3f(.85, .16, .1), vec3f(1., .6, .1), fract(h * 3.));
    alb = st * (.72 + .28 * sin(v * 170. + u * 2.)) * (.6 + .4 * v); emi = st * .05 * v;`);
ed(W, `let dx = s[3] * 0.5 + rr(-0.25, 0.25), dy = s[4] * 0.5 + 1, dz = s[5] * 0.5 + rr(-0.25, 0.25);`, `let dx = s[3] * 0.5 + rr(-0.25, 0.25), dy = abs(s[4]) * 0.5 + 1, dz = s[5] * 0.5 + rr(-0.25, 0.25);`);

// ---- 5. anemones: tentacles droop outward and curl, round shading, a low fleshy foot instead of a pot, bigger; bigger clownfish
ed(S, `    return a.xyz + (d * v + e1 * (sin(v * 2.4 + t * 1.1 + s * 40.) * .16 * v) + e2 * (cos(v * 2. + t * .9 + s * 31.) * .16 * v) + cur * (.3 * v * v)) * a.w;`,
  `    let out = d - vec3f(0., d.y, 0.); // tentacles lean out, droop under their own weight and curl at the tip
    return a.xyz + (d * v + out * (.55 * v * v) - vec3f(0., .32 * v * v * v, 0.)
      + e1 * (sin(v * 3.2 + t * 1.1 + s * 40.) * .2 * v + sin(v * 7. + s * 9.) * .07 * v * v) + e2 * (cos(v * 2.7 + t * .9 + s * 31.) * .2 * v) + cur * (.34 * v * v)) * a.w;`);
ed(S, `  var c = alb * (E * (.3 + .7 * sat(ndl) + .3 * sat(-ndl)) + amb(i.wp, n, vv.g, z) * 1.25);`, `  var c = alb * (E * (.3 + .7 * sat(ndl) + .3 * sat(-ndl)) + amb(i.wp, n, vv.g, z) * 1.25) * (.5 + .5 * sqrt(max(1. - u * u, 0.)));`);
ed(S, `    alb = mix(vec3f(.5, .18, .46), vec3f(.72, .3, .16), fract(sd * 3.9)) * (.5 + .6 * B.h); gloss = .4; bump = .5; flu = .5;`,
  `    alb = mix(vec3f(.3, .13, .3), vec3f(.4, .2, .14), fract(sd * 3.9)) * (.5 + .6 * B.h); gloss = .3; bump = .5;`);
ed(M, `meshLathe([[0, 0, 0.5], [0.3, 0, 0.5], [0.27, 0.2, 0.7], [0.38, 0.33, 0.9], [0.33, 0.38, 1], [0, 0.33, 0.8]], 12, 0.2).build());`,
  `meshLathe([[0, 0, 0.5], [0.33, 0, 0.5], [0.37, 0.1, 0.6], [0.34, 0.22, 0.7], [0.2, 0.3, 0.6], [0, 0.31, 0.5]], 14, 0.2).build());`);
ed(W, `const cx = x + nx * 0.34 * sc, cy = y + ny * 0.34 * sc, cz = z + nz * 0.34 * sc;`, `const cx = x + nx * 0.22 * sc, cy = y + ny * 0.22 * sc, cz = z + nz * 0.22 * sc;`);
ed(W, `if (k >= 0) anemone(k, rr(0.8, 1.7)); }`, `if (k >= 0) anemone(k, rr(1.1, 2.1)); }`);
ed(W, `for (const a of [[-1.5, 2.5, 1.5], [-9, -9, 1.2], [3.5, -2, 1], [...rel(3, 6, -1.5), 1.6], [...rel(3, 10, 6.5), 1.2], [...rel(0, 6.5, -2.2), 1.3]])`,
  `for (const a of [[-1.5, 2.5, 1.9], [-9, -9, 1.5], [3.5, -2, 1.3], [...rel(3, 6, -1.5), 2], [...rel(3, 10, 6.5), 1.5], [...rel(0, 6.5, -2.2), 1.7]])`);
ed(W, `fishAdd(4, a[0], a[1], a[2], 0.5 * a[3], 0, rr(0.18, 0.26), ph, 5, 1, 0, rnd() * 0.3);`, `fishAdd(4, a[0], a[1], a[2], 0.55 * a[3], 0, rr(0.3, 0.42), ph, 5, 1, 0, rnd() * 0.3);`);

// ---- 4. soft corals: rounder, no white variant, no clipping
ed(S, `    if (hue > .86) { alb = vec3f(.88, .9, .96); }
    alb = mix(alb * .5, mix(alb, vec3f(1.), .25), ss(.3, 1., i.ao)) * (.75 + .35 * B.h);
    emi = alb * .07 * ss(.5, 1., i.ao); flu = .9; gloss = .35; bump = .5;`,
  `    if (hue > .86) { alb = vec3f(.9, .55, .7); }
    alb = mix(alb * .45, mix(alb, vec3f(1.), .1), ss(.3, 1., i.ao)) * (.6 + .3 * B.h);
    emi = alb * .03 * ss(.5, 1., i.ao); flu = .3; gloss = .3; bump = .25;`);
ed(W, `m.tube(pts, (k) => r * (1 - 0.1 * k), LV > 1 ? 4 : 6, false, () => 0.2 + 0.12 * (2 - depth));`, `m.tube(pts, (k) => r * (1 - 0.1 * k), LV > 1 ? 4 : 9, false, () => 0.2 + 0.12 * (2 - depth));`);
ed(W, `m.tube(pts, (k) => r * [0.8, 1.1, 1.9, 2.3, 1][k], LV > 1 ? 4 : 6, true, (k) => 0.44 + k * 0.14); }`,
  `// the swollen tip, as a smooth bulb of 8 rings
      const tp = []; for (let k = 0; k <= 8; k++) { const f = k / 8, a = pts[min(4, f * 4 | 0)], b = pts[min(4, (f * 4 | 0) + 1)], g = f * 4 - (f * 4 | 0); tp.push([mix(a[0], b[0], g), mix(a[1], b[1], g), mix(a[2], b[2], g)]); }
      m.tube(tp, (k) => r * (0.8 + 1.5 * pow(sin(PI * pow(k / 8.4, 1.5)), 1.2)), LV > 1 ? 4 : 9, true, (k) => 0.44 + k * 0.07); }`);

// ---- 6. purple zone: richer violet instead of white-lilac, and a longer way in and out
ed(S, `const PCOL = vec3f(.58, .66, .98);`, `const PCOL = vec3f(.44, .40, .96);`);
ed(S, `PCOL + vec3f(.28, .16, .12), g.sun.w);`, `PCOL + vec3f(.12, .06, .04), g.sun.w);`);
ed(M, `let zt = (44 - sqrt(zx * zx + zz * zz)) / 18;`, `let zt = (66 - sqrt(zx * zx + zz * zz)) / 40;`);

// ---- 3 + deep blue distance: a little more fill in the dark, distance falls to deeper blue
ed(S, `const SIG = vec3f(.058, .0272, .0186);`, `const SIG = vec3f(.058, .0296, .0186);`);
ed(S, `const WCOL = vec3f(.11, .50, .96);`, `const WCOL = vec3f(.085, .43, .96);`);
ed(S, `(.55 + .45 * sat(-p.y / 30.)) + vec3f(.003, .010, .016);`, `(.55 + .45 * sat(-p.y / 30.)) + vec3f(.006, .019, .034);`);

// ---- 9. bubbles: smaller
ed(W, `const sz = rnd() < 0.24 ? rr(0.1, 0.3) : rr(0.025, 0.08);`, `const sz = rnd() < 0.12 ? rr(0.07, 0.16) : rr(0.015, 0.06);`);

// ---- 12 + missing hunters: viewpoint 3 sees the ball against open water; bigger hunters
ed(M, `POSES[2] = [b[0] + 11, b[1] - 3, b[2] + 8, b[0], b[1], b[2]]; }`, `POSES[2] = [b[0] - 9, b[1] - 3, b[2] + 10, b[0], b[1] + 1, b[2]]; }`);
ed(W, `fishAdd(3, p[0], p[1], p[2], 4.2, 0, f ? 1.15 : 1.5, ph, 4, 3, k, f);`, `fishAdd(3, p[0], p[1], p[2], 4.2, 0, f ? 1.6 : 2.1, ph, 4, 3, k, f);`);

// ---- 15. dev: a flight without the benchmark report on screen, for recordings
ed(D, `    bench() { pin(); dev.result = null; startFlight(true); },`, `    bench() { pin(); dev.result = null; startFlight(true); },
    flight() { pin(); startFlight(false); }, get flying() { return flying; },`);

for (const f in cache) writeFileSync(new URL(f, import.meta.url), cache[f]);
console.log('critic round 1 fixes applied');
