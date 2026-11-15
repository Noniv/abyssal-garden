// One-off edit script: the first frame (behind the loading screen) draws every culling cell at every distance band,
// so each instance buffer and each level-of-detail pipeline is used once before the visitor can move.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL(f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
const M = '../source/src/main.js';
ed(M, `const submitList = [null];`, `const submitList = [null];
// true for the first frame only: drawCells then draws every cell at every distance, which makes the GPU take in all
// the instance data and every level-of-detail variant now, instead of hitching the first time each comes into view
let warm = true;`);
ed(M, `        if (l <= h) {
          const px = OX`, `        if (warm) v = l <= h;
        else if (l <= h) {
          const px = OX`);
ed(M, `render(); await Q.onSubmittedWorkDone();`, `render(); await Q.onSubmittedWorkDone(); warm = false;`);
console.log('ok');
