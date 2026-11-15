// One-off edit script for step 2 (fish system): fish mesh builder + instance generation in world.js, and
// the renderer hookup in main.js. Each edit is [file, exact old text, new text] and must match exactly once.
import { readFileSync, writeFileSync } from 'node:fs';
const path = (f) => new URL('../source/src/' + f, import.meta.url);
const src = { 'world.js': readFileSync(path('world.js'), 'utf8'), 'main.js': readFileSync(path('main.js'), 'utf8') };
const edit = (f, a, b) => { const n = src[f].split(a).length - 1; if (n !== 1) throw new Error(`${f}: expected one match, found ${n}: ${a.slice(0, 80)}`); src[f] = src[f].replace(a, () => b); };

// ---- world.js: garden list becomes a named constant so fish can find the gardens
edit('world.js',
  `  for (const g of [[-68, -6, 9, 260], [-66, 6, 7, 160], [16, 72, 7, 200], [-6, 74, 6, 120], [-13, -2, 6, 80], [8, -88, 8, 160], [44, 12, 7, 120], [-62, 22, 6, 140], [-47, 40, 6, 140], [-30, 47, 6, 120], [-12, 48, 5, 100], [14, 28, 6, 140], [28, 45, 6, 120], [-36, -76, 6, 130], [-49, -58, 6, 130], [-58, -38, 6, 120]]) {`,
  `  const GARD = [[-68, -6, 9, 260], [-66, 6, 7, 160], [16, 72, 7, 200], [-6, 74, 6, 120], [-13, -2, 6, 80], [8, -88, 8, 160], [44, 12, 7, 120], [-62, 22, 6, 140], [-47, 40, 6, 140], [-30, 47, 6, 120], [-12, 48, 5, 100], [14, 28, 6, 140], [28, 45, 6, 120], [-36, -76, 6, 130], [-49, -58, 6, 130], [-58, -38, 6, 120]];
  for (const g of GARD) {`);

// ---- world.js: fish instances
edit('world.js',
  `  const fish = [];
  rseed(14);`,
  `  // 12 floats per fish: home xyz, radius | seed, speed, size, phase | colours, behaviour, two behaviour parameters
  // (see vsFish). One list per mesh: 0 bait, 1 slim, 2 triggerfish, 3 hunter, 4 clownfish, 5 disc, 6 idol, 7 parrotfish
  const fishK = Array.from({ length: 8 }, () => []);
  const fishAdd = (kind, x, y, z, R, speed, size, phase, col, beh, p1 = 1, p2 = 0) => fishK[kind].push(x, y, z, R, rnd(), speed, size, phase, col, beh, p1, p2);
  // open water within r of a point? (14 directions)
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; for (let i = 0; i < 8; i++) DIRS.push([i & 1 ? 0.58 : -0.58, i & 2 ? 0.58 : -0.58, i & 4 ? 0.58 : -0.58]);
  const open = (x, y, z, r) => { if (y + r > -1.5 || Dw(x, y, z) > 0) return false; for (const d of DIRS) if (Dw(x + d[0] * r, y + d[1] * r, z + d[2] * r) > 0) return false; return true; };
  // a point near (x, z), between lo and hi above the sea floor, with r of open water around it
  const spot = (x, z, lo, hi, r, spread = 9) => { for (let i = 0; i < 60; i++) { const px = x + rr(-spread, spread), pz = z + rr(-spread, spread), py = gy(px, pz) + rr(lo, hi); if (open(px, py, pz, r) && open(px, py, pz, r * 0.5)) return [px, py, pz]; } return null; };
  rseed(14);`);
edit('world.js',
  `  for (const s of SCH) { const ss = s[7] === undefined ? rnd() : s[7]; for (let i = 0; i < s[4]; i++) fish.push(s[0], s[1], s[2], s[3], rnd(), s[6] * 1.9 / s[3], s[5], ss); }`,
  `  // the ribbon schools: silver bait fish, fusiliers, chromis and two small schools of blue tang
  const SK = [[0, 0], [1, 10], [1, 11], [1, 10], [1, 11], [5, 7], [1, 10], [0, 0], [1, 11], [5, 7], [1, 10], [1, 11]];
  SCH.forEach((s, j) => { const ss = s[7] === undefined ? rnd() : s[7], [kind, col] = SK[j], tang = kind === 5; for (let i = 0; i < (tang ? 70 : s[4]); i++) fishAdd(kind, s[0], s[1], s[2], s[3], s[6] * 1.9 / s[3], tang ? 0.42 : s[5] * (kind ? 1.15 : 1), ss, col, 0, tang ? 0.5 : 1); });
  // anthias: a cloud over every sponge and coral garden, around the whale tail and the barrel sponges of viewpoint 4
  rseed(15);
  const CLOUD = GARD.map((g) => [g[0], g[1], min(g[2] * 0.6, 4.2)]); CLOUD.push([-5, -4, 3.2], [...rel(3, 9, 3.5), 3.5], [-2, 6, 2.6], [4, -8, 2.6]);
  for (const c of CLOUD) {
    const p = spot(c[0], c[1], 1.4, 2.4, 1, 1.5); if (!p) continue;
    const ph = rnd();
    for (let i = 0; i < 130; i++) fishAdd(1, p[0], p[1], p[2], c[2], 0, 0.24, ph, rnd() < 0.25 ? 2 : 1, 1, 0, rnd() * 0.04);
  }
  // bait balls in open water, each with two hunters that have two followers
  const BALLS = [];
  for (const b of [[-2, -25, 24], [26, -22, -46], [-40, -24, -36]]) {
    let y = b[1]; while (y < -9 && !open(b[0], y, b[2], 9)) y += 1.5;
    const ph = rnd(); BALLS.push([b[0], y, b[2]]);
    for (let i = 0; i < 2400 / THIN; i++) fishAdd(0, b[0], y, b[2], 4.2, 0, 0.2, ph, 0, 2);
    for (let k = 0; k < 2; k++) for (let f = 0; f < 3; f++) fishAdd(3, b[0], y, b[2], 4.2, 0, f ? 1.15 : 1.5, ph, 4, 3, k, f);
  }
  // loners near the gardens: triggerfish, parrotfish, pairs of butterflyfish and idols
  const loner = (kind, col, n, lo, hi, r0, r1, s0, s1, w0, w1, pair) => {
    for (let i = 0; i < n; i++) {
      const g = GARD[(rnd() * GARD.length) | 0], R = rr(r0, r1), p = spot(g[0], g[1], lo, hi, R * 1.3, 12); if (!p) continue;
      const w = rr(w0, w1) * (rnd() < 0.5 ? -1 : 1), ph = rnd(), ps = rnd(), up = rr(0.4, 1.3);
      fishAdd(kind, p[0], p[1], p[2], R, w, rr(s0, s1), ph, col, 4, up, ps);
      if (pair) fishAdd(kind, p[0], p[1], p[2], R, w, rr(s0, s1), ph + 0.9 / (R * TAU) * sign(w), col, 4, up, ps);
    }
  };
  loner(2, 3, 16, 2.5, 6, 3.5, 6, 0.6, 0.9, 0.06, 0.1);
  loner(7, 9, 18, 1.6, 3, 3, 5, 0.6, 0.8, 0.07, 0.11);
  loner(5, 6, 22, 1.5, 4, 2.5, 4.5, 0.34, 0.4, 0.1, 0.16, 1);
  loner(6, 8, 10, 2, 5, 3, 5, 0.4, 0.46, 0.09, 0.14, 1);
  const fish = [], fishR = []; { let n = 0; for (const a of fishK) { fishR.push([n, a.length / 12]); n += a.length / 12; for (let i = 0; i < a.length; i++) fish.push(a[i]); } }`);
edit('world.js', `fish: new Float32Array(fish), mantas:`, `fish: new Float32Array(fish), fishR, BALLS, mantas:`);

// ---- world.js: fish meshes replace the single old one
{
  const a = src['world.js'].indexOf('function meshFish() {'), b = src['world.js'].indexOf('\n}', a) + 2;
  if (a < 0) throw new Error('meshFish not found');
  src['world.js'] = src['world.js'].slice(0, a) + `// Fish: nose at +x, tail at -x, about 1 long. H and W are the half height and half width of the body rings at FX.
// Fins are flat sheets, given as base x, y, tip x, y, ... along the fin. aux is 0 on the body and rises to 1 at the fin
// tips (negative on the paired side fins): the shader ripples, tints and lights the fins with it.
const FX = [0.5, 0.42, 0.25, 0.02, -0.2, -0.35, -0.42];
function meshFishKind(H, W, fins, pec = 0.16, R = 8) {
  const m = new Mesh(), rings = [];
  for (let i = 0; i < 7; i++) { const r = []; for (let k = 0; k < R; k++) { const a = k / R * TAU; r.push(m.v(FX[i], sin(a) * H[i], cos(a) * W[i], 0)); } rings.push(r); }
  for (let i = 0; i < 6; i++) for (let k = 0; k < R; k++) { const k2 = (k + 1) % R; m.quad(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]); }
  const c0 = m.v(FX[0] + H[0] * 0.6, 0, 0, 0), c1 = m.v(FX[6] - 0.01, 0, 0, 0);
  for (let k = 0; k < R; k++) { const k2 = (k + 1) % R; m.tri(c0, rings[0][k2], rings[0][k]); m.tri(c1, rings[6][k], rings[6][k2]); }
  const sheet = (f, z0, z1, sg) => { let pa = 0, pb = 0; for (let j = 0; j < f.length; j += 4) { const a = m.v(f[j], f[j + 1], z0, 0.04 * sg), b = m.v(f[j + 2], f[j + 3], z1, sg); if (j) m.quad(pa, a, b, pb); pa = a; pb = b; } };
  for (const f of fins) sheet(f, 0, 0, 1);
  if (pec) for (const sx of [-1, 1]) sheet([0.2, -0.01, 0.12, 0.03, 0.17, -0.05, 0.2 - pec * 1.3, -0.07 - pec * 0.3, 0.15, -0.09, 0.08, -0.1], sx * W[2] * 0.9, sx * (W[2] + pec * 0.6), -1);
  return m;
}
// the eight fish shapes, in the order of the instance lists in makeWorld
function meshFishes() {
  // tail fin: root half height, length, half spread, fork (0 = square, 1 = forked to the root)
  const tail = (h, L, S, F) => [-0.41, h, -0.41 - L, S, -0.42, h * 0.5, -0.42 - L * (1 - F * 0.5), S * 0.45, -0.42, 0, -0.42 - L * (1 - F), 0, -0.42, -h * 0.5, -0.42 - L * (1 - F * 0.5), -S * 0.45, -0.41, -h, -0.41 - L, -S];
  const flip = (f) => f.map((v, i) => (i & 1 ? -v : v));
  const slimH = [0.012, 0.07, 0.13, 0.15, 0.11, 0.05, 0.035], slimW = [0.01, 0.04, 0.06, 0.065, 0.04, 0.018, 0.012];
  const discH = [0.02, 0.1, 0.25, 0.32, 0.27, 0.09, 0.045], discW = [0.012, 0.04, 0.06, 0.065, 0.045, 0.02, 0.012];
  const sail = [0.02, 0.3, 0.02, 0.33, -0.06, 0.285, -0.14, 0.56, -0.2, 0.22, -0.3, 0.44, -0.33, 0.085, -0.4, 0.15];
  const sickle = [0.02, 0.105, 0, 0.125, -0.05, 0.1, -0.2, 0.32, -0.18, 0.08, -0.27, 0.13, -0.36, 0.03, -0.4, 0.045];
  const ridge = [0.26, 0.24, 0.25, 0.27, 0.04, 0.32, 0, 0.4, -0.18, 0.27, -0.27, 0.4, -0.34, 0.095, -0.39, 0.16];
  const low = [0.2, 0.155, 0.19, 0.19, 0, 0.17, -0.02, 0.22, -0.2, 0.12, -0.24, 0.17, -0.34, 0.065, -0.37, 0.09];
  return [
    // bait fish: six-sided, no side fins
    meshFishKind([0.01, 0.07, 0.13, 0.16, 0.1, 0.045, 0.03], [0.008, 0.035, 0.055, 0.06, 0.035, 0.014, 0.01], [tail(0.03, 0.2, 0.2, 0.6), [0.05, 0.155, 0.02, 0.2, -0.1, 0.12, -0.16, 0.15]], 0, 6),
    // slim reef fish (anthias, fusiliers, chromis): lyre tail, long dorsal filament
    meshFishKind(slimH, slimW, [tail(0.035, 0.42, 0.3, 0.75), [0.22, 0.12, 0.24, 0.17, 0.14, 0.14, 0.08, 0.44, 0.04, 0.15, -0.03, 0.25, -0.12, 0.13, -0.18, 0.24, -0.26, 0.085, -0.36, 0.19, -0.34, 0.055, -0.38, 0.07],
      [-0.06, -0.14, -0.08, -0.17, -0.16, -0.12, -0.3, -0.27, -0.3, -0.07, -0.37, -0.11], [0.14, -0.135, 0.13, -0.15, 0.1, -0.14, -0.06, -0.32, 0.05, -0.148, 0.02, -0.17]]),
    // triggerfish: deep diamond body, sail fins set far back, trigger spine
    meshFishKind([0.02, 0.12, 0.24, 0.3, 0.22, 0.07, 0.04], [0.012, 0.05, 0.075, 0.08, 0.05, 0.02, 0.012], [sail, flip(sail), [0.16, 0.26, 0.15, 0.275, 0.12, 0.275, 0.05, 0.43, 0.06, 0.292, 0.03, 0.3], tail(0.04, 0.2, 0.17, 0.2)], 0.14),
    // hunter: torpedo with sickle fins and a deeply forked tail
    meshFishKind([0.01, 0.06, 0.1, 0.105, 0.07, 0.025, 0.018], [0.008, 0.04, 0.06, 0.06, 0.04, 0.014, 0.01], [sickle, flip(sickle), tail(0.018, 0.34, 0.34, 0.85)], 0.22),
    // clownfish: round body, round fins
    meshFishKind([0.03, 0.1, 0.16, 0.17, 0.13, 0.07, 0.05], [0.02, 0.06, 0.085, 0.09, 0.06, 0.03, 0.018], [[0.22, 0.15, 0.22, 0.19, 0.06, 0.17, 0.03, 0.27, -0.08, 0.155, -0.12, 0.2, -0.2, 0.13, -0.28, 0.25, -0.33, 0.075, -0.38, 0.12],
      [-0.05, -0.165, -0.07, -0.2, -0.2, -0.13, -0.28, -0.25, -0.33, -0.075, -0.38, -0.12], [0.12, -0.16, 0.1, -0.18, 0.06, -0.165, -0.04, -0.3, 0, -0.17, -0.02, -0.19], tail(0.05, 0.2, 0.16, 0)]),
    // disc (butterflyfish, tang)
    meshFishKind(discH, discW, [ridge, flip(ridge), tail(0.045, 0.2, 0.2, 0.3)], 0.14),
    // idol: the disc with a long trailing streamer
    meshFishKind(discH, discW, [[0.26, 0.24, 0.25, 0.27, 0.08, 0.31, 0.02, 0.45, -0.02, 0.32, -0.62, 0.95, -0.18, 0.27, -0.3, 0.42, -0.34, 0.095, -0.39, 0.16], flip(ridge), tail(0.045, 0.2, 0.2, 0.3)], 0.14),
    // parrotfish: blunt head, low fins, crescent tail
    meshFishKind([0.05, 0.11, 0.16, 0.17, 0.12, 0.06, 0.045], [0.03, 0.06, 0.085, 0.09, 0.06, 0.025, 0.015], [low, flip(low), tail(0.045, 0.26, 0.26, 0.7)], 0.2),
  ];
}
` + src['world.js'].slice(b);
}

// ---- main.js
edit('main.js', `const pFish = scenePipe(mAnim, 'vsFish', 'fsFish', [vbSolid, ibAnim]);`, `const pFish = scenePipe(mAnim, 'vsFish', 'fsFish', [vbSolid, ibSolid]);`);
edit('main.js', `// mesh ids: 0-3 boulders, 4-6 sponges, 7-8 coral, 9 tube sponge, 10 whale fluke, 11 ship, 12 manta, 13 fish,
// 14-20 rock chunks + pebbles, 21-22 coral LOD, 23-25 far LOD of the large rock chunks`,
  `// mesh ids: 0-3 boulders, 4-6 sponges, 7-8 coral, 9 tube sponge, 10 whale fluke, 11 ship, 12 manta, 13 bait fish,
// 14-20 rock chunks + pebbles, 21-22 coral LOD, 23-25 far LOD of the large rock chunks, 26-32 the other fish
const fishShapes = meshFishes().map((m) => m.build());`);
edit('main.js', `meshManta().build(), meshFish().build(),`, `meshManta().build(), fishShapes[0],`);
edit('main.js', `let nV = 0, nI = 0;\nfor (const m of meshes)`, `meshes.push(...fishShapes.slice(1));\nlet nV = 0, nI = 0;\nfor (const m of meshes)`);
edit('main.js', `const nFish = Wd.fish.length / 8, nManta`, `const nManta`);
edit('main.js', `const MANTA = meshes[12], FISH = meshes[13];`, `const MANTA = meshes[12], NFISH = fishShapes.length, fishR = Wd.fishR;`);
edit('main.js', `r.setPipeline(pFish); r.setVertexBuffer(1, ibFish); r.drawIndexed(FISH.ib.length, nFish, FISH.i0, FISH.v0, 0);`,
  `r.setPipeline(pFish); r.setVertexBuffer(1, ibFish);
  for (let i = 0; i < NFISH; i++) { const m = fishShapes[i], n = fishR[i]; if (n[1]) r.drawIndexed(m.ib.length, n[1], m.i0, m.v0, n[0]); }`);

for (const f in src) writeFileSync(path(f), src[f]);
console.log('fish system edits applied');
