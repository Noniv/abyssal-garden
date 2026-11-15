// One-off edit script: brings Math.sign into scope and adds dev.look()/dev.balls to dev.js.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL('../source/src/' + f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
ed('math.js', 'hypot, exp, round } = Math;', 'hypot, exp, round, sign } = Math;');
ed('dev.js', `    bench() { pin(); dev.result = null; startFlight(true); },`,
  `    // camera at (x, y, z) looking at (tx, ty, tz), scene clock held at t if given
    look(x, y, z, tx, ty, tz, t) { pin(); stop(); lookAt(x, y, z, tx, ty, tz); F[VX] = F[VY] = F[VZ] = 0; if (t >= 0) fixT = t; },
    balls: Wd.BALLS, fishRanges: Wd.fishR,
    bench() { pin(); dev.result = null; startFlight(true); },`);
console.log('ok');
