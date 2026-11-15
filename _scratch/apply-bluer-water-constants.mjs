// One-off edit script: shifts the water from teal-green toward turquoise-cyan (near) and deep blue (far).
// Each entry is [exact old text, new text]; the script fails loudly if an old text is not found exactly once.
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../source/src/shaders.js', import.meta.url);
let src = readFileSync(file, 'utf8');
const edits = [
  ['const SIG = vec3f(.058, .0235, .0195);', 'const SIG = vec3f(.058, .0272, .0186);'],
  ['const KD = vec3f(.056, .0245, .0170);', 'const KD = vec3f(.056, .0288, .0164);'],
  ['const WCOL = vec3f(.16, .58, .90);', 'const WCOL = vec3f(.11, .50, .96);'],
  ['const SUNC = vec3f(1.7, 1.6, 1.45);', 'const SUNC = vec3f(1.66, 1.6, 1.56);'],
  ['  let a = sg(z) - k * rd.y;\n', '  let a0 = sg(z) - k * rd.y;\n  let a = select(a0, vec3f(1e-4), abs(a0) < vec3f(1e-4)); // looking almost straight up a channel can reach 0\n'],
  ['mix(vec3f(.22, .60, .80), vec3f(.34, .56, .82), z)', 'mix(vec3f(.18, .54, .86), vec3f(.34, .56, .82), z)'],
  ['let sky = (vec3f(.30, .78, 1.) * 1.3', 'let sky = (vec3f(.27, .71, 1.) * 1.3'],
  ['c = mix(vec3f(l), c, .93) + vec3f(.008, .002, 0.);', 'c = mix(vec3f(l), c, .95) + vec3f(.002, .003, .007);'],
];
for (const [a, b] of edits) {
  const n = src.split(a).length - 1;
  if (n !== 1) throw new Error(`expected exactly one match, found ${n}: ${a}`);
  src = src.replace(a, b);
}
writeFileSync(file, src);
console.log(`applied ${edits.length} edits`);
