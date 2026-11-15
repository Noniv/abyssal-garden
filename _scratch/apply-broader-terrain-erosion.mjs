// One-off edit script: adds a metre-scale erosion layer to the High-detail seabed, and applies the same displacement
// to the coarse vertex positions the world generator places things on, so they stay seated.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL(f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
const W = '../source/src/world.js';
ed(W, `  for (let k = 0; k < nv; k++) normalAt(k);
  // the generator places things on the coarse vertices (world space)
  const wp = new Float32Array(nv * 3), wn = gn.slice(0, nv * 3);
  for (let k = 0; k < nv; k++) { wp[k * 3] = OX + gp[k * 3] * VS; wp[k * 3 + 1] = OY + gp[k * 3 + 1] * VS; wp[k * 3 + 2] = OZ + gp[k * 3 + 2] * VS; }`,
  `  for (let k = 0; k < nv; k++) normalAt(k);
  // erosion on High: three scales of noise pushed along the normal, the broadest (up to a quarter metre) to break up
  // long straight edges
  const erode = (X, Y, Z) => fine ? (fbm(X * 0.42, Y * 0.42, Z * 0.42, 3) - 0.5) * 0.9 + (fbm(X * 1.1, Y * 1.1, Z * 1.1, 3) - 0.5) * 0.24 + (vnoise(X * 4.3, Y * 4.3, Z * 4.3) - 0.5) * 0.07 : 0;
  // the generator places things on the coarse vertices (world space)
  const wp = new Float32Array(nv * 3), wn = gn.slice(0, nv * 3);
  for (let k = 0; k < nv; k++) {
    const X = OX + gp[k * 3] * VS, Y = OY + gp[k * 3 + 1] * VS, Z = OZ + gp[k * 3 + 2] * VS, e = erode(X, Y, Z);
    wp[k * 3] = X + gn[k * 3] * e; wp[k * 3 + 1] = Y + gn[k * 3 + 1] * e; wp[k * 3 + 2] = Z + gn[k * 3 + 2] * e;
  }`);
ed(W, `    // erosion: two scales of noise pushed along the normal (a few centimetres, so what stands on the rock still does)
    if (fine) { const e = (fbm(X * 1.1, Y * 1.1, Z * 1.1, 3) - 0.5) * 0.24 + (vnoise(X * 4.3, Y * 4.3, Z * 4.3) - 0.5) * 0.07; X += nx * e; Y += ny * e; Z += nz * e; }`,
  `    if (fine) { const e = erode(X, Y, Z); X += nx * e; Y += ny * e; Z += nz * e; }`);
console.log('ok');
