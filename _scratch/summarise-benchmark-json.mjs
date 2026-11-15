// Usage: node summarise-benchmark-json.mjs <bench.json>
// Prints the benchmark flight result (written by chrome-run-benchmark-flight-return-json.js) as one table row per
// measure, plus where the slow frames were: counts per 5-second slice of the flight for frames at or over 20 ms
// (a dropped 60 Hz frame) and for GPU times over 16.7 ms.
import { readFileSync } from 'node:fs';
const t = readFileSync(process.argv[2], 'utf8'), d = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
const row = (n, o) => o ? `${n}: avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms  over16.7: ${o.over16_7} of ${o.n}` : `${n}: none`;
console.log(`${d.width}x${d.height} detail ${d.detail} drawDistanceScale ${d.drawDistanceScale}`);
console.log(row('GPU  ', d.gpu)); console.log(row('frame', d.frame));
const slices = {}; let f20 = 0, g167 = 0;
for (const [at, fr, gp] of d.slow || []) { const k = Math.floor(at / 5) * 5; slices[k] ||= [0, 0]; if (fr >= 20) { slices[k][0]++; f20++; } if (gp > 16.7) { slices[k][1]++; g167++; } }
console.log(`frames >= 20 ms: ${f20}, GPU > 16.7 ms: ${g167} (first ${d.slow ? d.slow.length : 0} slow frames listed)`);
for (const k of Object.keys(slices).sort((a, b) => a - b)) if (slices[k][0] || slices[k][1]) console.log(`  flight ${k}-${+k + 5} s: frames>=20ms ${slices[k][0]}, gpu>16.7ms ${slices[k][1]}`);
