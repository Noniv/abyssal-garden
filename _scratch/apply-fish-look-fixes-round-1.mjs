// One-off edit script: first round of fish look fixes after the portrait renders (smaller anthias fins in body
// colours, less fin glow, sickle-shaped idol streamer, brighter flashing bait fish). Edits the WGSL block kept in
// _scratch/new-fish-shader-block.wgsl (then re-splice it) and the mesh specs in world.js.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (p, a, b) => { p = new URL(p, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
const W = './new-fish-shader-block.wgsl', J = '../source/src/world.js';
ed(W, `fc = vec3f(.7, .25, .95); fg = vec3f(1., .3, .75) * .9; ir = .3;`, `fc = mix(alb, vec3f(.7, .25, .95), ss(.35, 1., fi)); fg = vec3f(1., .3, .75) * .5; ir = .3;`);
ed(W, `fc = vec3f(1., .8, .15); fg = vec3f(1., .7, .2) * .7; ir = .3;`, `fc = mix(alb, vec3f(1., .8, .15), ss(.2, .8, fi)); fg = vec3f(1., .7, .2) * .5; ir = .3;`);
ed(W, `fc = vec3f(.05, .1, .2); fg = vec3f(.2, .9, 1.) * 1.2;`, `fc = mix(vec3f(.04, .08, .18), vec3f(.1, .5, .7), ss(.5, 1., fi)); fg = vec3f(.2, .9, 1.) * .6;`);
ed(W, `fc = mix(vec3f(.02), vec3f(.95), ss(.1, .5, fi)); fg = vec3f(.8, .9, 1.);`, `fc = mix(vec3f(.02), vec3f(.95), ss(.1, .5, fi)); fg = vec3f(.8, .9, 1.) * .35;`);
ed(W, `alb = mix(vec3f(.58, .74, .86), vec3f(.08, .2, .38), back);`, `alb = mix(vec3f(.78, .88, .95), vec3f(.1, .26, .46), back);`);
ed(W, `alb = mix(alb, fc, ss(.02, .2, fi)); emi += fg * fi * fi;`, `alb = mix(alb, fc, ss(.02, .2, fi)); emi += fg * fi * fi * .6;`);
// bait fish get a broad silver flash on their flanks, strongest when a hunter is near
ed(W, `  c += irid(ndv * 1.2 + x * .6 + s) * ir * pow(1. - ndv, 1.5) * (E + .1);`,
  `  c += irid(ndv * 1.2 + x * .6 + s) * ir * pow(1. - ndv, 1.5) * (E + .1);
  if (i.sd.y < .5) { c += E * pow(sat(dot(n, normalize(V + L))), 5.) * (.5 + 1.5 * i.sd.z) * (1. - back); }`);
ed(J, `[tail(0.035, 0.42, 0.3, 0.75), [0.22, 0.12, 0.24, 0.17, 0.14, 0.14, 0.08, 0.44, 0.04, 0.15, -0.03, 0.25, -0.12, 0.13, -0.18, 0.24, -0.26, 0.085, -0.36, 0.19, -0.34, 0.055, -0.38, 0.07],
      [-0.06, -0.14, -0.08, -0.17, -0.16, -0.12, -0.3, -0.27, -0.3, -0.07, -0.37, -0.11], [0.14, -0.135, 0.13, -0.15, 0.1, -0.14, -0.06, -0.32, 0.05, -0.148, 0.02, -0.17]]),`,
  `[tail(0.035, 0.3, 0.2, 0.7), [0.22, 0.12, 0.23, 0.15, 0.14, 0.14, 0.09, 0.3, 0.04, 0.15, -0.01, 0.21, -0.12, 0.13, -0.16, 0.2, -0.26, 0.085, -0.33, 0.15, -0.34, 0.055, -0.37, 0.07],
      [-0.06, -0.14, -0.08, -0.16, -0.16, -0.12, -0.26, -0.21, -0.3, -0.07, -0.36, -0.1], [0.14, -0.135, 0.13, -0.15, 0.1, -0.14, -0.02, -0.25, 0.05, -0.148, 0.03, -0.165]], 0.1),`);
ed(J, `[[0.26, 0.24, 0.25, 0.27, 0.08, 0.31, 0.02, 0.45, -0.02, 0.32, -0.62, 0.95, -0.18, 0.27, -0.3, 0.42, -0.34, 0.095, -0.39, 0.16], flip(ridge)`,
  `[[0.26, 0.24, 0.25, 0.27, 0.1, 0.3, 0.08, 0.38, 0.03, 0.32, -0.02, 0.6, -0.02, 0.32, -0.5, 1, -0.06, 0.31, -0.16, 0.6, -0.2, 0.26, -0.28, 0.4, -0.34, 0.095, -0.39, 0.16], flip(ridge)`);
ed(J, `fishAdd(0, p[0], p[1], p[2], 4.2, 0, 0.2, ph, 0, 2);`, `fishAdd(0, p[0], p[1], p[2], 4.2, 0, 0.25, ph, 0, 2);`);
console.log('ok');
