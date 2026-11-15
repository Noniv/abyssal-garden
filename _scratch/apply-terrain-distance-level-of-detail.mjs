// One-off edit script: the 4x-subdivided seabed is drawn within 60 m; beyond that the original coarse quads are drawn
// from the same vertex buffer (their indices are appended after the fine ones).
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL(f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a.slice(0, 80)); writeFileSync(p, s.replace(a, () => b)); };
const W = '../source/src/world.js', M = '../source/src/main.js';
ed(W, `  const per = fine ? 24 : 6, ib = new Uint32Array(nq * per), fill = cnt.slice();`,
  `  // fine indices first; on High the coarse quads follow them, in the same cell order, for the distant seabed
  const per = fine ? 24 : 6, ib = new Uint32Array(nq * (fine ? 30 : 6)), fill = cnt.slice();`);
ed(W, `      const o = fill[key[q]]++ * 24;
      put(o, v0, e0, c, e3);`, `      const o = fill[key[q]]++ * 24;
      for (let j = 0; j < 6; j++) ib[nq * 24 + o / 4 + j] = I[i + j];
      put(o, v0, e0, c, e3);`);
ed(W, `  return { vb, ib, nv, wp, wn, smp, start: cnt, lo, hi };`, `  return { vb, ib, nv, wp, wn, smp, start: cnt, lo, hi, fine, nFine: nq * per };`);
ed(M, `  const ds = indexed === 1 ? 1 : det * det;`, `  const ds = indexed === 1 || indexed === 2 ? 1 : det * det;`);
ed(M, `if (indexed === 1) r.drawIndexed(n * 6, 1, a * 6, 0, nSolid); else if (indexed)`, `if (indexed === 1) r.drawIndexed(n * 6, 1, a * 6, 0, nSolid); else if (indexed === 2) r.drawIndexed(n * 1.5, 1, T.nFine + a * 1.5, 0, nSolid); else if (indexed)`);
ed(M, `  drawCells(r, T.start, T.lo, T.hi, 1.5, 1, 0, 0, 240);`, `  // the seabed: on High, four times finer within 60 m
  drawCells(r, T.start, T.lo, T.hi, 1.5, 1, 0, 0, T.fine ? 60 : 240);
  if (T.fine) drawCells(r, T.start, T.lo, T.hi, 1.5, 2, 0, 60, 240);`);
ed(M, `  r.drawIndexed(T.ib.length, 1, 0, 0, nSolid);`, `  r.drawIndexed(T.nFine, 1, 0, 0, nSolid);`);
console.log('ok');
