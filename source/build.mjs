// Bundles src/*.js into the single self-contained ../index.html
//   npm run build            minified
//   npm run build:readable   unminified, for debugging
//   npm run build:dev        ../dev.html: unminified, plus the development tools in src/dev.js
//   npm run build:crew       ../crew/index.html: the multiplayer version (src/net/*, served by ../server)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILES = ['quality.js', 'math.js', 'shaders.js', 'world.js', 'main.js', 'audio.js']; // concatenation order matters
const dev = process.argv.includes('--dev'), crew = process.argv.includes('--crew'), readable = dev || process.argv.includes('--readable');
const out = dev ? 'dev.html' : crew ? 'crew/index.html' : 'index.html';
if (dev) FILES.push('dev.js');
// multiplayer: the shared catalogue and the crew layer go in before main.js, which reaches them through `NET`
if (crew) FILES.splice(FILES.indexOf('main.js'), 0, 'net/catalog.js', 'net/bounds.js', 'net/crew.js');

let js = FILES.map((f) => readFileSync(path.join(here, 'src', f), 'utf8')).join('\n');
let tpl = readFileSync(path.join(here, 'template.html'), 'utf8');
if (crew) {
  // the net files are ES modules for the server; in the page they share the one function scope
  js = js.replace(/^import [^\n]*\n/gm, '').replace(/^export /gm, '');
  const swap = (a, b) => { if (!tpl.includes(a)) throw new Error('template changed: ' + a); tpl = tpl.replace(a, b); };
  swap('<title>Abyssal Garden</title>', '<title>Abyssal Crew</title>');
  swap('<h1>Abyssal Garden</h1>', '<h1>Abyssal Crew</h1>');
  swap('<i><b>1</b>–<b>6</b></i>Viewpoints', '<i><b>1</b>–<b>6</b></i>Emotes');
  swap('<i><b>H</b></i>Stats', '<i><b>H</b></i>Stats\n          <i><b>F</b></i>Analyse\n          <i><b>V</b></i>Voice\n          <i><b>Enter</b></i>Chat');
}
// everything runs inside one async function; startup errors are shown on screen
const wrap = (body) => `(async()=>{${body}\n})().catch(e=>{console.error(e);document.body.className='l e';document.getElementById('s').textContent=(e.cause?'':'Failed to start: ')+e.message});`;

let html;
if (readable) {
  html = tpl.replace('/*SCRIPT*/', () => wrap(js));
} else {
  // shrink the WGSL inside /*wgsl*/ template literals, then minify the JS and the page's CSS
  const minWgsl = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').replace(/ ?([{}()\[\];,:=+\-*\/<>&|!%@]) ?/g, '$1').trim();
  js = js.replace(/\/\*wgsl\*\/`([^`]*)`/g, (_, w) => '`' + minWgsl(w) + '`');
  const code = transformSync(wrap(js), { minify: true, target: 'es2022', legalComments: 'none' }).code.trim();
  const css = (_, s) => '<style>' + transformSync(s, { loader: 'css', minify: true }).code.trim();
  html = tpl.replace(/<style>([^]*?)(?=<\/style>)/, css).replace(/>\s+</g, '><').replace('/*SCRIPT*/', () => code).replace(/<script>\s+/, '<script>').replace(/\s+<\/script>/, '</script>');
}
mkdirSync(path.dirname(path.join(here, '..', out)), { recursive: true });
writeFileSync(path.join(here, '..', out), html);
const gz = gzipSync(Buffer.from(html), { level: 9 }).length;
console.log(`${out}: ${(html.length / 1024).toFixed(1)} kB${readable ? ' (readable)' : ''}, ${(gz / 1024).toFixed(1)} kB gzipped`);
