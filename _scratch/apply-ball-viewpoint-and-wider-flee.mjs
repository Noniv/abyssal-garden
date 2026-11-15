// One-off edit script: viewpoint 3 moves to the first bait ball; bait fish flee hunters from further away.
import { readFileSync, writeFileSync } from 'node:fs';
const ed = (f, a, b) => { const p = new URL(f, import.meta.url); let s = readFileSync(p, 'utf8'); if (s.split(a).length !== 2) throw new Error('no single match: ' + a); writeFileSync(p, s.replace(a, () => b)); };
ed('../source/src/main.js', `for (const p of POSES) p[1] += Wd.gy(p[0], p[2]);`,
  `for (const p of POSES) p[1] += Wd.gy(p[0], p[2]);
// viewpoint 3 watches the first bait ball, wherever the generator found open water for it
if (Wd.BALLS[0]) { const b = Wd.BALLS[0]; POSES[2] = [b[0] + 11, b[1] - 3, b[2] + 8, b[0], b[1], b[2]]; }`);
for (const f of ['../source/src/shaders.js', './new-fish-shader-block.wgsl'])
  ed(f, `let ro = R * .55;
      p += d / max(l, .01) * (ro * 1.15 * exp(-l * l / (ro * ro)));`, `let ro = R * .75;
      p += d / max(l, .01) * (ro * 1.1 * exp(-l * l / (ro * ro)));`);
// decoder: contact sheets from whichever image type was captured
ed('./decode-captured-dataurls-to-images.mjs', `for (const n of list) args.push('-i', join(outDir, \`\${n}.jpg\`));`, `for (const n of list) args.push('-i', join(outDir, \`\${n}.\${data.shots[n].startsWith('data:image/png') ? 'png' : 'jpg'}\`));`);
console.log('ok');
