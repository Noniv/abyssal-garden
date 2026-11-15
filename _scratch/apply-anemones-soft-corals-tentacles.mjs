// One-off edit script for step 3: tentacle pipeline (anemones, pulsing polyps, sea whips), soft coral trees
// (new mesh + swaying material), anemone columns, clownfish. Each edit must match exactly once.
import { readFileSync, writeFileSync } from 'node:fs';
const path = (f) => new URL('../source/src/' + f, import.meta.url);
const src = {}; for (const f of ['world.js', 'main.js', 'shaders.js', 'math.js']) src[f] = readFileSync(path(f), 'utf8');
const edit = (f, a, b) => { const n = src[f].split(a).length - 1; if (n !== 1) throw new Error(`${f}: expected one match, found ${n}: ${a.slice(0, 90)}`); src[f] = src[f].replace(a, () => b); };

// ================= shaders.js
// soft coral sways; material 6 = soft coral, 7 = anemone column
edit('shaders.js', `  w.y += sin(g.cam.w * .3 + i.c.y * 40.) * i.c.w;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = qrot(i.b, i.n.xyz);`,
  `  w.y += sin(g.cam.w * .3 + i.c.y * 40.) * i.c.w;
  if (abs(i.c.x - 6.) < .5) { // soft coral bends with the current, more toward its tips
    let h = i.p.y * sc; let ph = dot(i.a.xz, vec2f(.9, .6)) + i.c.y * 6.;
    w += vec3f(.8, 0., .6) * (sin(g.cam.w * .8 + ph + h * .7) * .07 * h * h) + vec3f(-.6, 0., .8) * (cos(g.cam.w * .63 + ph * 1.3 + h) * .04 * h * h);
  }
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = qrot(i.b, i.n.xyz);`);
edit('shaders.js', `    vao = i.ao * i.ao; gloss = .2; bump = 1.4; flu = .55;
  } else {`,
  `    vao = i.ao * i.ao; gloss = .2; bump = 1.4; flu = .55;
  } else if (mat == 6) { // soft coral: pastel flesh, paler glowing tips
    let hue = fract(sd * 9.17);
    alb = mix(vec3f(.95, .32, .58), vec3f(.6, .34, .95), fract(hue * 3.));
    if (hue > .66) { alb = vec3f(1., .58, .22); }
    if (hue > .86) { alb = vec3f(.88, .9, .96); }
    alb = mix(alb * .5, mix(alb, vec3f(1.), .25), ss(.3, 1., i.ao)) * (.75 + .35 * B.h);
    emi = alb * .07 * ss(.5, 1., i.ao); flu = .9; gloss = .35; bump = .5;
  } else if (mat == 7) { // anemone column
    alb = mix(vec3f(.5, .18, .46), vec3f(.72, .3, .16), fract(sd * 3.9)) * (.5 + .6 * B.h); gloss = .4; bump = .5; flu = .5;
  } else {`);
edit('shaders.js', `// ---------------------------------------------------------------- fish + mantas`,
  `// ---------------------------------------------------------------- tentacles (anemones, polyps, sea whips)
// One ribbon per tentacle, turned to face the camera and shaded as a round tube; no mesh, the strip is built from the
// vertex index like the leaves. a = root xyz + length, b = axis xyz + radius, c = kind, seed, colour, phase.
// Kinds: 0 anemone tentacle (b = its rest direction), 1 arm of a polyp that opens and closes (b = the polyp's axis,
// the seed places the arm around it), 2 sea whip.
const W_TENT = S_B + /*wgsl*/\`
override ROWS: f32 = 8.;
struct TI { @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct TO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) uv: vec2f, @location(2) sd: vec3f, @location(3) @interpolate(flat) m: vec4f, @location(4) lt: f32 };
fn tpos(a: vec4f, b: vec4f, c: vec4f, v: f32, t: f32) -> vec3f {
  let d = b.xyz; let e1 = normalize(cross(d, vec3f(.31, .2, .93))); let e2 = cross(d, e1); let s = c.y;
  // the current comes in waves that travel across the reef
  let cur = vec3f(.8, 0., .6) * sin(t * .8 + dot(a.xz, vec2f(.9, .6)) + c.w * 6.3);
  if (c.x < .5) {
    return a.xyz + (d * v + e1 * (sin(v * 2.4 + t * 1.1 + s * 40.) * .16 * v) + e2 * (cos(v * 2. + t * .9 + s * 31.) * .16 * v) + cur * (.3 * v * v)) * a.w;
  }
  if (c.x < 1.5) { // the arm curls away from the axis by an angle that pulses: an arc in closed form
    let az = s * TAU; let rad = e1 * cos(az) + e2 * sin(az);
    let f = .7 + .55 * sin(t * 1.6 + c.w * 6.3);
    return a.xyz + (d * sin(f * v) + rad * (1. - cos(f * v))) * (a.w / f) + cur * (.05 * v * a.w);
  }
  return a.xyz + (d * v + e1 * (sin(v * 3. + s * 20.) * .05 * v) + cur * (.13 * v * v)) * a.w;
}
@vertex fn vs(@builtin(vertex_index) vi: u32, i: TI) -> TO {
  var o: TO;
  let u = f32(vi & 1u) * 2. - 1.; let v = f32(vi >> 1u) / (ROWS - 1.); let t = g.cam.w;
  let p = tpos(i.a, i.b, i.c, v, t);
  let tg = normalize(tpos(i.a, i.b, i.c, v + .04, t) - tpos(i.a, i.b, i.c, v - .04, t));
  let vd = g.cam.xyz - p; let dist = length(vd);
  let sd = normalize(cross(tg, vd / dist));
  // tapering, with a bulb at the tip of anemone tentacles and polyp arms; never thinner than about a pixel
  var r = i.b.w * (1. - .5 * v);
  if (i.c.x < 1.5) { r += i.b.w * .7 * ss(.72, .9, v); }
  r *= sqrt(max(1. - pow(max(v - .9, 0.) * 10., 2.), 0.));
  r = max(r, dist * .0007 * step(v, .99));
  if (g.res.x > 0. && dist > 85. * g.mis.z) { r = 0.; }
  let w = p + sd * (u * r);
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.uv = vec2f(u, v); o.sd = sd; o.m = i.c; o.lt = shadow1(i.a.xyz + i.b.xyz * .3);
  return o;
}
@fragment fn fs(i: TO) -> @location(0) vec4f {
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz; let u = i.uv.x; let v = i.uv.y;
  let n = normalize(normalize(i.sd) * u + V * sqrt(max(1. - u * u, 0.)));
  let z = zone(i.wp); let vv = vol(i.wp); let ca = caus2(i.wp, distance(g.cam.xyz, i.wp));
  let h = i.m.z; let k = i.m.x; let tip = ss(.7, .92, v);
  var body = vec3f(.85, .2, .6); var tc = vec3f(.3, .95, 1.);
  if (h > .25) { body = vec3f(.2, .75, .42); tc = vec3f(1., .45, .8); }
  if (h > .5) { body = vec3f(.9, .72, .46); tc = vec3f(.7, .4, 1.); }
  if (h > .75) { body = vec3f(.16, .36, .95); tc = vec3f(1., .82, .3); }
  var alb = mix(body * (.45 + .55 * v), tc, tip); var emi = tc * tip * .55 + body * .05 * v;
  if (k > 1.5) { // sea whip: warm stem, a row of pale glowing polyps
    let dots = ss(.55, .9, sin(v * 110.)) * ss(.1, .2, v);
    alb = mix(mix(vec3f(.85, .16, .1), vec3f(1., .6, .1), fract(h * 3.)), vec3f(1., .95, .85), dots); emi = vec3f(1., .8, .55) * dots * .3;
  } else if (k > .5) { // polyp: pale arms, the pulse shows as a soft glow
    alb = mix(mix(vec3f(.75, .8, 1.), vec3f(1., .75, .85), fract(h * 2.)), vec3f(1.), tip * .6);
    emi = alb * (.06 + .1 * tip);
  }
  let E = sunE(i.wp.y, z) * i.lt * (.5 + .5 * ca);
  let ndl = dot(n, L);
  var c = alb * (E * (.3 + .7 * sat(ndl) + .3 * sat(-ndl)) + amb(i.wp, n, vv.g, z) * 1.25);
  c += E * pow(sat(dot(n, normalize(V + L))), 30.) * .5 + alb * pow(abs(u), 3.) * .25 * vv.g;
  c += emi * (.8 + .2 * sin(g.cam.w * 1.7 + i.m.y * 50.));
  return fin(fog(c, i.wp, z));
}
\`;

// ---------------------------------------------------------------- fish + mantas`);

// ================= world.js
edit('world.js', `  const props = Array.from({ length: 6 }, () => Array.from({ length: nCells }, () => []));
  const solid = (mesh, x, y, z, sc, q, mat, seed, ts = 1, bob = 0) => { (mesh > 3 && mesh < 10 ? props[mesh - 4][cellOf(x, z)] : (solids[mesh] ||= [])).push(`,
  `  const props = PROPM.map(() => Array.from({ length: nCells }, () => []));
  const solid = (mesh, x, y, z, sc, q, mat, seed, ts = 1, bob = 0) => { const pi = PROPM.indexOf(mesh); (pi >= 0 ? props[pi][cellOf(x, z)] : (solids[mesh] ||= [])).push(`);
edit('world.js', `  // 12 floats per fish: home xyz, radius | seed, speed, size, phase`,
  `  // --- soft coral trees, anemones, polyp carpets and sea whips
  // tentacles (12 floats): root xyz, length | axis xyz, radius | kind, seed, colour, phase (see W_TENT)
  const tent = Array.from({ length: nCells }, () => []), ANEM = [];
  const tentacle = (x, y, z, len, d, r, kind, sd, col, ph) => tent[cellOf(x, z)].push(x, y, z, len, d[0], d[1], d[2], r, kind, sd, col, ph);
  // a terrain vertex within r of (x, z) facing up at least ny, deeper than 13 m, off the camera path
  const pickNear = (x, z, r, ny) => { for (let i = 0; i < 300000; i++) { const k = pickV(); if (hypot(T.wp[k] - x, T.wp[k + 2] - z) < r && T.wn[k + 1] >= ny && T.wp[k + 1] < -13 && !nearFly(T.wp[k], T.wp[k + 1], T.wp[k + 2], 2)) return k; } return -1; };
  const anemone = (k, sc) => {
    const x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2]; let nx = T.wn[k], ny = T.wn[k + 1] + 0.7, nz = T.wn[k + 2]; const l = hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const [t1, t2] = tangent([nx, ny, nz]), col = rnd(), ph = rnd(), N = 110 >> LV, R = 0.36 * sc;
    solid(35, x - nx * 0.06, y - ny * 0.06, z - nz * 0.06, sc, qFromY(nx, ny, nz), 7, col);
    const cx = x + nx * 0.34 * sc, cy = y + ny * 0.34 * sc, cz = z + nz * 0.34 * sc;
    for (let i = 0; i < N; i++) { // tentacles on a sunflower spiral over the disc, leaning outward toward the rim
      const f = sqrt((i + 0.5) / N), a = i * 2.39996, ca = cos(a), sa = sin(a), ox = t1[0] * ca + t2[0] * sa, oy = t1[1] * ca + t2[1] * sa, oz = t1[2] * ca + t2[2] * sa;
      let dx = nx + ox * f * 1.1, dy = ny + oy * f * 1.1, dz = nz + oz * f * 1.1; const dl = hypot(dx, dy, dz);
      tentacle(cx + ox * f * R, cy + oy * f * R, cz + oz * f * R, sc * rr(0.4, 0.62) * (0.75 + 0.4 * f), [dx / dl, dy / dl, dz / dl], 0.03 * sc * (LV ? 1.5 : 1), 0, rnd(), col, ph);
    }
    ANEM.push([cx + nx * 0.4 * sc, cy + ny * 0.4 * sc, cz + nz * 0.4 * sc, sc]);
  };
  rseed(16);
  // gardens get soft corals, anemones and a few sea whips; viewpoints 1 and 4 get an anemone or two in view
  for (const g of GARD) {
    for (let i = 0; i < 16; i++) { const k = pickNear(g[0], g[1], g[2] + 2, 0.5); if (k < 0) break; const q = qMul(qFromY(T.wn[k] * 0.4, 1, T.wn[k + 2] * 0.4), qAxis(0, 1, 0, rnd() * TAU)); solid(33 + (rnd() * 2 | 0), T.wp[k], T.wp[k + 1] - 0.05, T.wp[k + 2], rr(0.7, 1.9), q, 6, rnd()); }
    for (let i = 0; i < 4; i++) { const k = pickNear(g[0], g[1], g[2] + 1, 0.75); if (k >= 0) anemone(k, rr(0.8, 1.7)); }
  }
  for (const a of [[-1.5, 2.5, 1.5], [-9, -9, 1.2], [3.5, -2, 1], [...rel(3, 6, -1.5), 1.6], [...rel(3, 10, 6.5), 1.2], [...rel(0, 6.5, -2.2), 1.3]]) { const k = pickNear(a[0], a[1], 1.6, 0.75); if (k >= 0) anemone(k, a[2]); }
  // scattered: sea whips in clumps on any rock, polyp carpets on up-facing rock
  for (let i = 0; i < 520; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2];
    if (hypot(x, z) > 165 || y > -12 || T.wn[k + 1] < -0.2 || nearFly(x, y, z, 3) || rnd() > zw(x, z)) continue;
    const n0 = [T.wn[k], T.wn[k + 1], T.wn[k + 2]], [t1, t2] = tangent(n0), col = rnd(), ph = rnd();
    if (i % 3) { // whips
      for (let j = 0, n = 4 + rnd() * 7 | 0; j < n; j++) {
        const a = rr(-0.5, 0.5), b = rr(-0.5, 0.5), s = snap(x + t1[0] * a + t2[0] * b, y + t1[1] * a + t2[1] * b, z + t1[2] * a + t2[2] * b, n0); if (!s) continue;
        let dx = s[3] * 0.5 + rr(-0.25, 0.25), dy = s[4] * 0.5 + 1, dz = s[5] * 0.5 + rr(-0.25, 0.25); const dl = hypot(dx, dy, dz);
        tentacle(s[0], s[1] - 0.03, s[2], rr(1.2, 3.4), [dx / dl, dy / dl, dz / dl], rr(0.02, 0.032) * (LV ? 1.5 : 1), 2, rnd(), col, ph);
      }
    } else if (n0[1] > 0.4) { // polyps: eight arms each, the whole carpet pulsing in a slow wave
      for (let j = 0, n = (40 + rnd() * 50 | 0) >> LV; j < n; j++) {
        const a = rr(-1, 1) * 0.9, b = rr(-1, 1) * 0.9, s = snap(x + t1[0] * a + t2[0] * b, y + t1[1] * a + t2[1] * b, z + t1[2] * a + t2[2] * b, n0); if (!s) continue;
        const len = rr(0.16, 0.3), o = rnd(), pp = ph + (a + b) * 0.08;
        for (let m = 0; m < 8; m++) tentacle(s[0], s[1], s[2], len, [s[3], s[4], s[5]], 0.016 * (LV ? 1.5 : 1), 1, (m + o) / 8, col, pp);
      }
    }
  }
  // 12 floats per fish: home xyz, radius | seed, speed, size, phase`);
edit('world.js', `  // bait balls in open water, each with two hunters that have two followers`,
  `  // clownfish: three or four hovering in each anemone
  for (const a of ANEM) { const ph = rnd(); for (let i = 0, n = 3 + (rnd() * 2 | 0); i < n; i++) fishAdd(4, a[0], a[1], a[2], 0.5 * a[3], 0, rr(0.18, 0.26), ph, 5, 1, 0, rnd() * 0.3); }
  // bait balls in open water, each with two hunters that have two followers`);
edit('world.js', `props: props.map(packC), big:`, `props: props.map(packC), tent: packC(tent), ANEM, big:`);
edit('world.js', `function meshTubes() {`,
  `// soft coral tree: a fat trunk, a few branches, swollen tips (aux rises to 1 at the tips: paler and glowing)
function meshSoft(sd) {
  rseed(230 + sd);
  const m = new Mesh(), nrm = (v) => { const l = hypot(...v) || 1; return v.map((c) => c / l); };
  const br = (p, d, r, len, depth) => {
    const pts = [p]; let q = p;
    for (let i = 0; i < 3; i++) { d = nrm([d[0] + rr(-0.25, 0.25), d[1] + rr(0, 0.3), d[2] + rr(-0.25, 0.25)]); q = [q[0] + d[0] * len / 3, q[1] + d[1] * len / 3, q[2] + d[2] * len / 3]; pts.push(q); }
    if (depth) {
      m.tube(pts, (k) => r * (1 - 0.1 * k), LV > 1 ? 4 : 6, false, () => 0.2 + 0.12 * (2 - depth));
      for (let i = 0, n = 3 + (rnd() < 0.5); i < n; i++) br(q, nrm([d[0] + rr(-0.9, 0.9), d[1] + rr(0, 0.5), d[2] + rr(-0.9, 0.9)]), r * 0.62, len * 0.7, depth - 1);
    } else { pts.push([q[0] + d[0] * r * 2.4, q[1] + d[1] * r * 2.4, q[2] + d[2] * r * 2.4]); m.tube(pts, (k) => r * [0.8, 1.1, 1.9, 2.3, 1][k], LV > 1 ? 4 : 6, true, (k) => 0.44 + k * 0.14); }
  };
  br([0, 0, 0], [0, 1, 0], 0.13, 0.55, 2);
  return m;
}
function meshTubes() {`);

// ================= math.js: which meshes are "props" (cell-sorted, culled, drawn with LODs)
edit('math.js', `const CELLS = 16, CELLW = 24;`, `// meshes drawn as culled props: sponges, corals, tube sponge, the two soft corals, the anemone column
const PROPM = [4, 5, 6, 7, 8, 9, 33, 34, 35];
const CELLS = 16, CELLW = 24;`);

// ================= main.js
edit('main.js', `const mSolid = mod(W_SOLID), mLeaf = mod(W_LEAF), mAnim = mod(W_ANIM),`, `const mSolid = mod(W_SOLID), mLeaf = mod(W_LEAF), mAnim = mod(W_ANIM), mTent = mod(W_TENT),`);
edit('main.js', `const pManta = scenePipe(`, `const pTent = scenePipe(mTent, 'vs', 'fs', [ibSolid], { strip: true }), pTentF = scenePipe(mTent, 'vs', 'fs', [ibSolid], { strip: true, constants: { ROWS: 4 } });
const pManta = scenePipe(`);
edit('main.js', `// 14-20 rock chunks + pebbles, 21-22 coral LOD, 23-25 far LOD of the large rock chunks, 26-32 the other fish`,
  `// 14-20 rock chunks + pebbles, 21-22 coral LOD, 23-25 far LOD of the large rock chunks, 26-32 the other fish,
// 33-34 soft coral, 35 anemone column`);
edit('main.js', `meshes.push(...fishShapes.slice(1));`, `meshes.push(...fishShapes.slice(1), meshSoft(0).build(), meshSoft(1).build(),
  meshLathe([[0, 0, 0.5], [0.3, 0, 0.5], [0.27, 0.2, 0.7], [0.38, 0.33, 0.9], [0.33, 0.38, 1], [0, 0.33, 0.8]], 12, 0.2).build());`);
edit('main.js', `ibProp = Wd.props.map((c) => buf(c.data, BU.VERTEX));`, `ibProp = Wd.props.map((c) => buf(c.data, BU.VERTEX)), ibTent = buf(Wd.tent.data, BU.VERTEX);`);
edit('main.js', `  if (!LV) for (let i = 0; i < 6; i++) if (Wd.props[i].n) { r.setVertexBuffer(1, ibProp[i]); r.drawIndexed(meshes[4 + i].ib.length, Wd.props[i].n, meshes[4 + i].i0, meshes[4 + i].v0, 0); }`,
  `  if (!LV) for (let i = 0; i < PROPM.length; i++) if (Wd.props[i].n) { const m = meshes[PROPM[i]]; r.setVertexBuffer(1, ibProp[i]); r.drawIndexed(m.ib.length, Wd.props[i].n, m.i0, m.v0, 0); }`);
edit('main.js', `for (const o of [Wd.big, Wd.bigF, Wd.small, ...Wd.chunks, ...Wd.props]) o.buf = o.data = 0;`, `for (const o of [Wd.big, Wd.bigF, Wd.small, Wd.tent, ...Wd.chunks, ...Wd.props]) o.buf = o.data = 0;`);
edit('main.js', `  for (let i = 0; i < 6; i++) {
    const lod = i === 3 || i === 4; r.setVertexBuffer(1, ibProp[i]);
    drawCells(r, Wd.props[i].start, Wd.props[i].lo, Wd.props[i].hi, 3, meshes[4 + i], 0, 0, lod ? 6 : 110);`,
  `  for (let i = 0; i < PROPM.length; i++) {
    const lod = i === 3 || i === 4; r.setVertexBuffer(1, ibProp[i]);
    drawCells(r, Wd.props[i].start, Wd.props[i].lo, Wd.props[i].hi, 3, meshes[PROPM[i]], 0, 0, lod ? 6 : 110);`);
edit('main.js', `  r.setPipeline(pSurf); r.draw(4);`,
  `  // tentacles: 8-row ribbons up close, 4 rows further off
  r.setPipeline(pTent); r.setVertexBuffer(0, ibTent); drawCells(r, Wd.tent.start, Wd.tent.lo, Wd.tent.hi, 4, false, 16, 0, 26);
  r.setPipeline(pTentF); drawCells(r, Wd.tent.start, Wd.tent.lo, Wd.tent.hi, 4, false, 8, 26, 85);
  r.setPipeline(pSurf); r.draw(4);`);

for (const f in src) writeFileSync(path(f), src[f]);
console.log('step 3 edits applied');
