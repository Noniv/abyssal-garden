// One-off edit script: viewpoint 3 looks up at the bait ball against the sunburst; the ball is filled in rather than
// a shell; bait fish are darker underneath so they read against bright water.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL(f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
ed('../source/src/main.js', `POSES[2] = [b[0] - 9, b[1] - 3, b[2] + 10, b[0], b[1] + 1, b[2]]; }`, `POSES[2] = [b[0] - 6, b[1] - 9, b[2] + 5, b[0], b[1] + 1.5, b[2]]; }`);
for (const f of ['../source/src/shaders.js', './new-fish-shader-block.wgsl']) {
  ed(f, `let rd = R * (.45 + .55 * pow(h.z, .4)) * (1. + .07 * sin(t * .9 + b.w * 20.));`, `let rd = R * (.12 + .88 * pow(h.z, .55)) * (1. + .07 * sin(t * .9 + b.w * 20.));`);
  ed(f, `alb = mix(vec3f(.78, .88, .95), vec3f(.1, .26, .46), back);`, `alb = mix(vec3f(.5, .62, .74), vec3f(.07, .2, .4), back);`);
}
ed('./chrome-capture-critic-stills-jpeg-and-png-crops-as-dataurls.js', `const t = n === 3 ? tp - 1.4 : 20;`, `const t = n === 3 ? tp - 0.6 : 20;`);
ed('./chrome-capture-flight-frame-triplets-as-dataurls.js', `for (let k = 0; k < 3; k++) { d.fly(t + k / 60); out.shots`, `for (let k = 0; k < 3; k++) { d.fly(t, t + k / 60); out.shots`);
console.log('ok');
