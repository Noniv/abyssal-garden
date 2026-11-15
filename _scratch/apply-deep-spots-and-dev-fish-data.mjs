// One-off edit script: keeps fish spots off the shallow plateau tops (must be deeper than 13 m), and exposes the
// fish instance array to dev tools so capture scripts can work out where a loner is at a given time.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL('../source/src/' + f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
ed('world.js', `py = gy(px, pz) + rr(lo, hi); if (up ?`, `py = gy(px, pz) + rr(lo, hi); if (py < -13 && (up ?`);
ed('world.js', `open(px, py, pz, r) && open(px, py, pz, r * 0.5)) return [px, py, pz]; } return null; };`, `open(px, py, pz, r) && open(px, py, pz, r * 0.5))) return [px, py, pz]; } return null; };`);
ed('dev.js', `spots: Wd.SPOTS, fishRanges: Wd.fishR,`, `spots: Wd.SPOTS, fishRanges: Wd.fishR, fish: Wd.fish,`);
console.log('ok');
