// One-off edit script: records where anthias clouds and loners were placed (Wd.SPOTS) so dev tools can aim at them.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL('../source/src/' + f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
ed('world.js', `    const ph = rnd();\n    for (let i = 0; i < 130; i++)`, `    const ph = rnd(); SPOTS.push([1, ...p]);\n    for (let i = 0; i < 130; i++)`);
ed('world.js', `  const CLOUD = GARD.map(`, `  const SPOTS = []; // [mesh kind, x, y, z] of clouds and loners, for the dev tools\n  const CLOUD = GARD.map(`);
ed('world.js', `      const w = rr(w0, w1) * (rnd() < 0.5 ? -1 : 1), ph = rnd(), ps = rnd();`, `      const w = rr(w0, w1) * (rnd() < 0.5 ? -1 : 1), ph = rnd(), ps = rnd(); SPOTS.push([kind, ...p]);`);
ed('world.js', `fishR, BALLS, mantas:`, `fishR, BALLS, SPOTS, mantas:`);
ed('dev.js', `balls: Wd.BALLS, fishRanges: Wd.fishR,`, `balls: Wd.BALLS, spots: Wd.SPOTS, fishRanges: Wd.fishR,`);
console.log('ok');
