// One-off edit script: anemone tentacles thinner, more numerous, 12 rows up close, smooth bulb tip, less glow.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL('../source/src/' + f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
ed('shaders.js', `  var r = i.b.w * (1. - .5 * v);
  if (i.c.x < 1.5) { r += i.b.w * .7 * ss(.72, .9, v); }
  r *= sqrt(max(1. - pow(max(v - .9, 0.) * 10., 2.), 0.));`,
  `  var r = i.b.w * (1. - .45 * v);
  if (i.c.x < 1.5) { let q = (v - .87) / .08; r += i.b.w * .6 * exp(-q * q); }
  r *= sqrt(max(1. - pow(max(v - .93, 0.) / .07, 2.), 0.));`);
ed('shaders.js', `let h = i.m.z; let k = i.m.x; let tip = ss(.7, .92, v);`, `let h = i.m.z; let k = i.m.x; let tip = ss(.78, .95, v);`);
ed('shaders.js', `var alb = mix(body * (.45 + .55 * v), tc, tip); var emi = tc * tip * .55 + body * .05 * v;`, `var alb = mix(body * (.4 + .6 * v), tc, tip); var emi = tc * tip * .22 + body * .03 * v;`);
ed('main.js', `const pTent = scenePipe(mTent, 'vs', 'fs', [ibSolid], { strip: true }),`, `const pTent = scenePipe(mTent, 'vs', 'fs', [ibSolid], { strip: true, constants: { ROWS: 12 } }),`);
ed('main.js', `drawCells(r, Wd.tent.start, Wd.tent.lo, Wd.tent.hi, 4, false, 16, 0, 26);`, `drawCells(r, Wd.tent.start, Wd.tent.lo, Wd.tent.hi, 4, false, 24, 0, 26);`);
ed('world.js', `col = rnd(), ph = rnd(), N = 110 >> LV, R = 0.36 * sc;`, `col = rnd(), ph = rnd(), N = 170 >> LV, R = 0.36 * sc;`);
ed('world.js', `sc * rr(0.4, 0.62) * (0.75 + 0.4 * f), [dx / dl, dy / dl, dz / dl], 0.03 * sc * (LV ? 1.5 : 1), 0,`, `sc * rr(0.45, 0.7) * (0.75 + 0.4 * f), [dx / dl, dy / dl, dz / dl], 0.021 * sc * (LV ? 1.5 : 1), 0,`);
console.log('ok');
