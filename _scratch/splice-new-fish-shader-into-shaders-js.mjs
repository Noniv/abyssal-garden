// One-off edit script: replaces the old vsFish + fsFish in source/src/shaders.js (everything from
// "@vertex fn vsFish" up to "@vertex fn vsManta") with _scratch/new-fish-shader-block.wgsl.
// Re-runnable: it finds the block by the same two markers each time (the new block starts with a comment
// line, so the start marker used is the first of "// Fish instances:" or "@vertex fn vsFish").
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../source/src/shaders.js', import.meta.url);
const block = readFileSync(new URL('./new-fish-shader-block.wgsl', import.meta.url), 'utf8');
let src = readFileSync(file, 'utf8');
let a = src.indexOf('// Fish instances:'); if (a < 0) a = src.indexOf('@vertex fn vsFish');
const b = src.indexOf('@vertex fn vsManta');
if (a < 0 || b < 0 || b < a) throw new Error(`markers not found: start ${a}, end ${b}`);
src = src.slice(0, a) + block + src.slice(b);
writeFileSync(file, src);
console.log(`replaced ${b - a} characters with ${block.length}`);
