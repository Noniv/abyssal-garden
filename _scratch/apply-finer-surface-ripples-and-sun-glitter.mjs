// One-off edit script: two finer ripple layers on the water surface near the camera, and a tight sun glitter.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL(f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
ed('../source/src/shaders.js', `textureSample(tW, sR, i.wp.xz / 37. + .6).ba * .8) * fl;`,
  `textureSample(tW, sR, i.wp.xz / 37. + .6).ba * .8) * fl
    // fine ripples, only near the camera (further off they would shimmer)
    + (textureSample(tW, sR, i.wp.xz / 1.9 + .4).ba * .4 + textureSample(tW, sR, i.wp.zx / .77 + .1).ba * .22) * ss(55., 5., d);`);
ed('../source/src/shaders.js', `(pow(sd, 60.) * 1.3 + pow(sd, 500.) * 12.)`, `(pow(sd, 60.) * 1.3 + pow(sd, 500.) * 12. + pow(sd, 4000.) * 70.)`);
// capture script: move to open water above the first bait ball
const C = './chrome-capture-surface-wave-views-as-dataurls.js';
let s = readFileSync(new URL(C, import.meta.url), 'utf8');
s = s.replace(/shot\('(\w+)', 20, (-[\d.]+), -20, ([\d.]+), (-?[\d.]+), (-[\d.]+), 20\)/g, (m, l, y, tx, ty, tz) => `shot('${l}', -2, ${y}, 24, ${(+tx - 22).toFixed(1)}, ${ty}, ${(+tz + 44).toFixed(1)}, 20)`);
writeFileSync(new URL(C, import.meta.url), s);
console.log(s.match(/await shot.*/g).join('\n'));
