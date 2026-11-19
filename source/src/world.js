// ============================================================================
// world layout + procedural content generation (load-time only)
// ============================================================================

// Sharks and manta rays: where each one is (the same formulas the vertex shaders run) and its body as ellipsoids, used both
// to keep the camera out of them and to keep their orbits clear of rock. Body units: lengths of the creature.
const BP = new Float64Array(12); // pose: position, then the body's sideways, up and forward axes
const SHARK_E = [[0, 0, .05, .2, .22, .97], [0, .18, -1.2, .04, .32, .25], [0, -.12, -1.12, .04, .2, .2], [0, .38, .08, .03, .2, .24], [.42, -.26, .1, .4, .05, .24], [-.42, -.26, .1, .4, .05, .24]];
const MANTA_E = [[0, 0, 0, .22, .16, .45], [.5, 0, -.02, .5, .14, .36], [-.5, 0, -.02, .5, .14, .36], [0, 0, -1.2, .03, .03, .75]];
function bodyPose(a, o, t, manta) {
  const R = a[o + 3], ta = t * a[o + 5] + a[o + 4], ph = a[o + 7], sg = a[o + 5] < 0 ? -1 : 1;
  let px, py, pz, tx, ty, tz, bank;
  if (manta) { px = a[o] + R * cos(ta); py = a[o + 1] + 2.5 * sin(2 * ta + ph); pz = a[o + 2] + R * 0.75 * sin(ta); tx = -R * sin(ta); ty = 5 * cos(2 * ta + ph); tz = R * 0.75 * cos(ta); bank = -0.28 * sg; }
  else { px = a[o] + R * cos(ta); py = a[o + 1] + 1.6 * sin(1.5 * ta + ph * 6); pz = a[o + 2] + R * 0.8 * sin(ta); tx = -R * sin(ta); ty = 2.4 * cos(1.5 * ta + ph * 6); tz = R * 0.8 * cos(ta); bank = -0.1 * sg; }
  const tl = hypot(tx, ty, tz); tx *= sg / tl; ty *= sg / tl; tz *= sg / tl;
  let sx = tz, sz = -tx; const sl = hypot(sx, sz); sx /= sl; sz /= sl; // normalize(cross(up, T))
  let ux = ty * sz, uy = tz * sx - tx * sz, uz = -ty * sx; // cross(T, S)
  const cb = cos(bank), sb = sin(bank), nsx = sx * cb + ux * sb, nsy = uy * sb, nsz = sz * cb + uz * sb;
  ux = ux * cb - sx * sb; uy = uy * cb; uz = uz * cb - sz * sb;
  BP[0] = px; BP[1] = py; BP[2] = pz; BP[3] = nsx; BP[4] = nsy; BP[5] = nsz; BP[6] = ux; BP[7] = uy; BP[8] = uz; BP[9] = tx; BP[10] = ty; BP[11] = tz;
}

// leaves per 2.5 m cell from which an area counts as very full of plants (the blacktip sharks avoid those)
const PLANT_DENSE = 12;
// the S-curve of a sleeping nurse shark's body: sideways offset (body units) at z, for bend amplitude A (the nose, z = 1, stays put)
const bendAt = (z, A) => A * sin((1 - z) * 1.55) * (0.15 + 0.85 * sstep(0.9, -0.4, z));
// designed rock masses: ax, az, bx, bz, radius, top, overhang, waist
const MESAS = [
  [-37, -42, -33, -22, 9, -7, 3.5, 2], [-29, -15, -33, 5, 12, -14, 3, 2], [-36, 11, -30, 27, 9, -5, 4, 2],   // west wall of the main canyon
  [30, -45, 35, -27, 9, -9, 4, 2], [37, -20, 31, -3, 11, -16, 3, 2], [32, 5, 35, 9, 7, -8, 4, 2],          // east wall
  [19, -15, 19, -15, 4.4, -6, 2, 1.5],   // pillar with window
  [6, -88, 6, -88, 10, -34, 0, 0],       // mound in the kelp basin
  [0, -106, 0, -106, 8, 3, 2, 2],        // pillar reaching the surface
  [44, 6, 47, -8, 7, -17, 3, 1],         // ship supports
  [33, 29, 37, 12, 9, -19, -6.5, 0],     // sloped sunlit wall beside the wreck
  [74, 14, 74, 14, 8, -15, 3, 1],
  [-84, -34, -80, -12, 10, -7, 6, 2], [-78, -6, -83, 12, 12, -13, 5, 2], [-82, 18, -79, 32, 9, -8, 6, 2],   // sponge canyon west wall
  [-17, 62, -19, 78, 10, -6, 9, 3], [-21, 84, -18, 100, 11, -9, 8, 3],     // grotto overhang cliff
  [22, 67, 24, 80, 7, -11, 6, 2],        // grotto coral rock
  [-16, 122, 34, 122, 9, -27, 3, 2],     // grotto far wall
];
// vertical ring arches: cx, cy, cz, yaw, major radius, minor radius, y squash
const ARCHES = [
  [-23, -9.5, -16, 0.3, 4.2, 1.4, 1.2],
  [0, -45, -34, 1.57, 14, 2.7, 1.2],
  [-40, -45, 44, 1.57, 10, 2.2, 1.3],
];
// carved tunnels: ax, ay, az, radius, bx, by, bz
const HOLES = [
  [19, -21, -23, 2.5, 19, -21, -7],
  [9, -37, 108, 4.2, 9, -34, 136],
];
// regions kept free of random mesas: ax, az, bx, bz, radius, softness
const CLEARS = [
  [0, -45, 0, 35, 22, 10], [0, -86, 0, -86, 46, 12], [42, 24, 74, 6, 22, 10], [72, -26, 72, -26, 26, 10],
  [-60, -36, -60, 36, 13, 8], [-60, 42, -18, 46, 12, 8], [4, 58, 8, 100, 24, 10], [-34, -74, -56, -46, 11, 8],
];
// tunnels through the big rock masses: each is a winding path (x, y, z points) with a radius; you go in at one end and
// have to find the other. Every segment is carved like a HOLES entry; the rest of the machinery (the dark volume, the map
// markers, the torch) reads this list. The first and last points lie outside the rock: the mouths.
const TUNNELS = [
  { id: 'A', r: 3.4, pts: [[-38, -30, -62], [-37, -30, -50], [-34, -27, -40], [-39, -31, -30], [-35, -33, -20], [-31, -30, -10], [-35, -27, 0], [-30, -30, 10], [-33, -32, 20], [-32, -30, 30], [-30, -28, 44]] },
  { id: 'B', r: 3.4, pts: [[30, -30, -64], [30, -30, -52], [33, -28, -40], [31, -31, -28], [36, -29, -17], [33, -32, -7], [31, -30, 3], [34, -28, 12], [34, -28, 26]] },
  { id: 'C', r: 3.4, pts: [[-83, -30, -56], [-83, -30, -46], [-81, -29, -38], [-84, -31, -28], [-79, -29, -18], [-80, -31, -8], [-83, -29, 2], [-80, -31, 12], [-79, -30, 24], [-79, -30, 42]] },
  { id: 'D', r: 2.7, pts: [[-17, -29, -108], [-9, -29, -105], [-2, -27, -109], [3, -30, -103], [8, -28, -107], [17, -29, -104]] },
];
for (const t of TUNNELS) {
  t.cum = [0]; for (let i = 1; i < t.pts.length; i++) t.cum.push(t.cum[i - 1] + hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1], t.pts[i][2] - t.pts[i - 1][2]));
  t.len = t.cum[t.cum.length - 1];
  for (let i = 0; i < t.pts.length - 1; i++) HOLES.push([...t.pts[i], t.r, ...t.pts[i + 1]]);
}
// how dark it is at a point: 1 inside a tunnel, fading out through its wall, and from nothing at a mouth to full dark ~11 m in
function tunnelDark(x, y, z, only) {
  let best = 0;
  for (const t of TUNNELS) for (let i = 0; i < t.pts.length - 1; i++) {
    const a = t.pts[i], b = t.pts[i + 1], bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], l2 = bx * bx + by * by + bz * bz;
    const h = clamp(((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / l2, 0, 1);
    const dist = hypot(x - a[0] - bx * h, y - a[1] - by * h, z - a[2] - bz * h);
    if (dist > t.r * 1.5 + 0.5) continue;
    const s = t.cum[i] + h * Math.sqrt(l2), k = sstep(t.r * 1.5 + 0.5, t.r * 0.95, dist) * sstep(1, 11, min(s, t.len - s));
    if (k > best) best = k;
  }
  return best;
}
const PURPLE = [6, 84];
const zoneP = (x, z) => sstep(44, 26, hypot(x - PURPLE[0], z - PURPLE[1]));
const MAGENTA = [[14, 6, 13], [-4, 20, 9], [6, 84, 30], [-58, 8, 10], [50, 30, 12], [8, -70, 10], [-12, -98, 9], [-36, 44, 9], [-46, -60, 9], [24, 42, 8], [-56, 26, 9], [-44, 38, 8], [-10, 44, 8], [12, 24, 8], [-50, -45, 8]];
const magAt = (x, z) => {
  let m = sstep(0.54, 0.66, fbm(x * 0.03, 7, z * 0.03, 3)) * 0.9;
  for (const p of MAGENTA) m = max(m, sstep(p[2], p[2] * 0.45, hypot(x - p[0], z - p[1])));
  return m * sstep(0.3, 0.55, fbm(x * 0.17, 1, z * 0.17, 2) + m * 0.25);
};

function primBuffer() {
  const a = [];
  for (const m of MESAS) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]);
  for (const m of ARCHES) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], 0);
  for (const m of HOLES) a.push(m[0], m[1], m[2], m[3], m[4], m[5], m[6], 0);
  for (const m of CLEARS) a.push(m[0], m[1], m[2], m[3], m[4], m[5], 0, 0);
  return new Float32Array(a);
}

// ---------------------------------------------------------------- terrain mesh from the density grid
function buildTerrain(D) {
  const sn = surfaceNets(D, NX, NY, NZ), nv = sn.nv, gp = sn.pos;
  const smp = sampler3(D, NX, NY, NZ);
  const vb = new ArrayBuffer(nv * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  const wp = new Float32Array(nv * 3), wn = new Float32Array(nv * 3);
  for (let k = 0; k < nv; k++) {
    const x = gp[k * 3], y = gp[k * 3 + 1], z = gp[k * 3 + 2], e = 0.8;
    let nx = smp(x - e, y, z) - smp(x + e, y, z), ny = smp(x, y - e, z) - smp(x, y + e, z), nz = smp(x, y, z - e) - smp(x, y, z + e);
    const l = hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const X = OX + x * VS, Y = OY + y * VS, Z = OZ + z * VS;
    wp[k * 3] = vf[k * 4] = X; wp[k * 3 + 1] = vf[k * 4 + 1] = Y; wp[k * 3 + 2] = vf[k * 4 + 2] = Z;
    wn[k * 3] = nx; wn[k * 3 + 1] = ny; wn[k * 3 + 2] = nz;
    v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = 127;
  }
  // bucket quads into the XZ culling grid
  const nq = sn.ni / 6, key = new Uint8Array(nq), cnt = new Uint32Array(CELLS * CELLS + 1);
  const lo = new Float32Array(CELLS * CELLS).fill(1e9), hi = new Float32Array(CELLS * CELLS).fill(-1e9);
  for (let q = 0; q < nq; q++) {
    const a = sn.idx[q * 6] * 3;
    const c = clamp(floor((wp[a] - OX) / CELLW), 0, CELLS - 1) + CELLS * clamp(floor((wp[a + 2] - OZ) / CELLW), 0, CELLS - 1);
    key[q] = c; cnt[c + 1]++;
    for (let j = 0; j < 6; j++) { const y = wp[sn.idx[q * 6 + j] * 3 + 1]; if (y < lo[c]) lo[c] = y; if (y > hi[c]) hi[c] = y; }
  }
  for (let c = 0; c < CELLS * CELLS; c++) cnt[c + 1] += cnt[c];
  const ib = new Uint32Array(sn.ni), fill = cnt.slice();
  for (let q = 0; q < nq; q++) { const o = fill[key[q]]++ * 6; for (let j = 0; j < 6; j++) ib[o + j] = sn.idx[q * 6 + j]; }
  return { vb, ib, nv, wp, wn, smp, start: cnt, lo, hi };
}

// ---------------------------------------------------------------- instance stores
function makeWorld(D, T, flyPts, POSES) {
  const gi = (x, y, z) => x + NX * (y + NY * z);
  const smp = T.smp;
  const Dw = (x, y, z) => smp((x - OX) / VS, (y - OY) / VS, (z - OZ) / VS);
  const nCells = CELLS * CELLS;
  const cellOf = (x, z) => clamp(floor((x - OX) / CELLW), 0, CELLS - 1) + CELLS * clamp(floor((z - OZ) / CELLW), 0, CELLS - 1);
  const big = Array.from({ length: nCells }, () => []), small = Array.from({ length: nCells }, () => []);
  // Medium and Low keep every 2nd / 4th leaf (but every kelp stem), made wider; the random stream is the same
  let nth = 0;
  const PMN = 128, plantW = new Uint16Array(PMN * PMN); // how many leaves grow in each 2.5 m cell (the blacktip sharks stay out of plants)
  const leaf = (L, x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend) => { if (L === big && len >= 1.4) { const pi = floor((x + 160) / 2.5), pj = floor((z + 160) / 2.5); if (pi >= 0 && pi < PMN && pj >= 0 && pj < PMN) plantW[pi + PMN * pj]++; } if (type === 1 || !(nth++ % THIN)) L[cellOf(x, z)].push(x, y, z, len, yaw, tilt, type === 1 ? wid : wid * (1 + LV / 2), hA, type, s1, s2, bend); };
  const glint = (...a) => { nth++ % THIN || glints.push(...a); };
  const solids = []; // per mesh id: arrays of 12 floats
  const props = Array.from({ length: 6 }, () => Array.from({ length: nCells }, () => []));
  const solid = (mesh, x, y, z, sc, q, mat, seed, ts = 1, bob = 0) => { (mesh > 3 && mesh < 10 ? props[mesh - 4][cellOf(x, z)] : (solids[mesh] ||= [])).push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, seed, ts, bob); };
  const chunks = Array.from({ length: NCHUNK }, () => Array.from({ length: nCells }, () => []));
  const glints = [];
  const rel = (i, f, r) => { const p = POSES[i]; let fx = p[3] - p[0], fz = p[5] - p[2]; const l = hypot(fx, fz); fx /= l; fz /= l; return [p[0] + fx * f - fz * r, p[2] + fz * f + fx * r]; };
  const bubbles = [], kelpAbs = new Float32Array((NX / 2) * (NY / 2) * (NZ / 2));

  // --- surface queries
  const fl = [];
  const floorsAt = (x, z) => {
    const ix = clamp(round((x - OX) / VS), 1, NX - 2), iz = clamp(round((z - OZ) / VS), 1, NZ - 2);
    fl.length = 0; let ceil = 3;
    for (let gy = NY - 2; gy >= 0; gy--) {
      const d = D[gi(ix, gy, iz)], da = D[gi(ix, gy + 1, iz)];
      if (da <= 0 && d > 0) { const y = OY + (gy + d / (d - da)) * VS; fl.push(y, min(ceil, 0) - y); } else if (da > 0 && d <= 0) ceil = OY + (gy + 0.5) * VS;
    }
    return fl;
  };
  const grad = (x, y, z) => {
    const e = 0.6; let nx = Dw(x - e, y, z) - Dw(x + e, y, z), ny = Dw(x, y - e, z) - Dw(x, y + e, z), nz = Dw(x, y, z - e) - Dw(x, y, z + e);
    const l = hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
  };
  // march from outside along -n to the surface
  const snap = (x, y, z, n) => {
    let px = x + n[0] * 2.5, py = y + n[1] * 2.5, pz = z + n[2] * 2.5, prev = Dw(px, py, pz);
    if (prev > 0) return null;
    for (let i = 0; i < 24; i++) {
      const qx = px - n[0] * 0.25, qy = py - n[1] * 0.25, qz = pz - n[2] * 0.25, d = Dw(qx, qy, qz);
      if (d > 0) { const t = prev / (prev - d); const p = [mix(px, qx, t), mix(py, qy, t), mix(pz, qz, t)]; return p.concat(grad(p[0], p[1], p[2])); }
      px = qx; py = qy; pz = qz; prev = d;
    }
    return null;
  };
  const pickV = () => ((rnd() * T.nv) | 0) * 3;
  const tangent = (n) => { let t = abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [1, 0, 0]; const l = hypot(...t); t = t.map((v) => v / l); return [t, [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]]; };
  // sleeping nurse sharks: where the groups lie (found below); their patches of sea floor are kept clear of decoration
  const nurseSites = [], nearNurse = (x, z, r) => nurseSites.some((s) => hypot(x - s[0], z - s[2]) < r);
  // the camera path, and the mouths of the tunnels (kept free of growth so they can be spotted), are kept clear of decoration
  const nearFly = (x, y, z, r) => {
    if (nearNurse(x, z, 7 + r)) return true;
    for (const p of flyPts) if (hypot(x - p[0], z - p[2]) < r && y < p[1] + 3 && y > p[1] - 13) return true;
    for (const t of TUNNELS) for (const e of [t.pts[0], t.pts[t.pts.length - 1]]) if (hypot(x - e[0], z - e[2]) < 13 + r) return true;
    return false;
  };
  const inTunnel = (x, y, z) => tunnelDark(x, y, z) > 0.2; // loose rocks stay out of the tunnels
  const nearPose = (x, z, r = 3) => { for (const p of POSES) if (hypot(x - p[0], z - p[2]) < r) return true; return false; };
  // --- nurse shark sites: flat, open, sandy-looking floor away from viewpoints, the camera path and the tunnels; the first four
  // lie in front of viewpoints 1, 2, 4 and 6 so they are easy to come across, the rest anywhere
  rseed(15);
  {
    const POSEI = [0, 1, 3, 5];
    for (let tries = 0; tries < 30000 && nurseSites.length < 7; tries++) {
      const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2], want = nurseSites.length < 4 ? POSES[POSEI[nurseSites.length]] : null;
      if (T.wn[k + 1] < 0.95 || y > -26 || y < -48 || hypot(x, z) > 130) continue;
      if (want && (tries < 25000) && !(hypot(x - want[0], z - want[2]) > 14 && hypot(x - want[0], z - want[2]) < 32)) continue;
      if (nurseSites.some((s) => hypot(x - s[0], z - s[2]) < 36) || nearPose(x, z, 10) || flyPts.some((p) => hypot(x - p[0], z - p[2]) < 8)) continue;
      if (TUNNELS.some((t) => [t.pts[0], t.pts[t.pts.length - 1]].some((e) => hypot(x - e[0], z - e[2]) < 20)) || tunnelDark(x, y, z) > 0.01) continue;
      let ok = true;
      for (let a = 0; a < 8 && ok; a++) for (const r of [2.5, 5]) { const f = floorsAt(x + cos(a * TAU / 8) * r, z + sin(a * TAU / 8) * r); if (f.length !== 2 || abs(f[0] - y) > 0.45) { ok = false; break; } }
      if (ok) nurseSites.push([x, y, z]);
    }
  }
  // --- kelp columns
  const column = (x, y, z, H, kind, dens = 1) => {
    const strands = 2 + (rnd() < 0.6) + (rnd() < 0.3), ph = rnd() * TAU, tw = rr(0.1, 0.28), sr = rr(0.2, 0.55), sc = rr(0.75, 1.25);
    const la = rnd() * TAU, lm = rr(0, 0.11), full = rr(0.55, 1.3) * dens;
    const stem = (s, h) => { const a = ph + s * TAU / strands + h * tw, r = sr * (1 - 0.6 * h / H), ln = lm * h * h / H; return [x + cos(a) * r + cos(la) * ln, z + sin(a) * r + sin(la) * ln, a]; };
    for (let s = 0; s < strands; s++) for (let h = 0; h < H - 1; h += 1.7) { const p = stem(s, h); leaf(big, p[0], y + h, p[1], 2.1, p[2] + PI / 2, 0.1, 0.17, h, 1, rnd(), rnd(), 0.3); }
    const n = floor(H * 30 * full);
    for (let i = 0; i < n; i++) {
      const t = pow(rnd(), 0.9), h = t * H, p = stem((rnd() * strands) | 0, h);
      const L = ((0.55 + 0.75 * rnd() * rnd()) * (1 - 0.5 * t * t) * sc + 0.25) * (kind === 1 ? 1.25 : 1.15);
      const tilt = mix(rr(0.4, 1.0), rr(0.15, 0.45), t);
      const type = kind === 1 ? (rnd() < 0.8 ? 3 : 4) : kind === 2 ? (rnd() < 0.5 ? 4 : 0) : 0;
      leaf(big, p[0], y + h, p[1], L, rnd() * TAU, tilt, L * (kind === 1 ? rr(0.09, 0.13) : rr(0.15, 0.21)) + 0.03, h, type, rnd(), rnd(), rr(0.38, 0.95));
    }
    for (let i = floor(H * (kind === 1 ? 16 : 13)); i > 0; i--) { const h = rnd() * H, a = rnd() * TAU, r = rr(0.15, 0.8) * (1 - 0.5 * h / H), ln = lm * h * h / H; glint(x + cos(a) * r + cos(la) * ln, y + h, z + sin(a) * r + sin(la) * ln, h, rnd(), kind === 1 ? rnd() : rnd() * 0.6, rr(0.018, 0.05), 0); }
    // light absorption footprint for the skylight bake
    const hx = round((x - OX) / VS / 2), hz = round((z - OZ) / VS / 2);
    for (let hy = floor((y - OY) / VS / 2); hy <= floor((y + H - OY) / VS / 2); hy++) {
      if (hy >= 0 && hy < NY / 2 && hx > 0 && hx < NX / 2 - 1 && hz > 0 && hz < NZ / 2 - 1) kelpAbs[hx + NX / 2 * (hy + NY / 2 * hz)] += 0.17;
    }
  };
  const KELPZ = [[-32, -5, 13, 0.85], [0, -86, 46, 1], [72, -26, 27, 0.9], [-60, -4, 11, 0.8], [0, -36, 12, 0.55], [-17, -8, 6, 0.8], [15, -8, 6, 0.8], [-4, 120, 20, 0.4], [-45, -63, 15, 0.9], [62, -26, 12, 0.9], [-100, 70, 30, 0.8], [100, 60, 30, 0.8], [-95, -90, 32, 0.8], [105, -85, 30, 0.7]];
  const NOKELP = [[-5, -106.5, 8], [4.6, -109.4, 10], [14.2, -112.3, 12], [-26, -100, 6], [-20.5, -101.7, 4.5], [-14.8, -104.5, 6], [-7.5, -107.8, 7], [4, 112, 11], [2, 4, 15], [42, 22, 12], [6, 78, 19], [-58, -16, 8], [9, -66, 9], [8, -76, 8]];
  const kelpDens = (x, z) => {
    for (const p of NOKELP) if (hypot(x - p[0], z - p[1]) < p[2]) return 0;
    let d = sstep(0.52, 0.64, fbm(x * 0.022, 4, z * 0.022, 3)) * 0.5;
    for (const p of KELPZ) d = max(d, p[3] * sstep(p[2], p[2] * 0.75, hypot(x - p[0], z - p[1])));
    return d;
  };
  const occ = new Set();
  rseed(1);
  const tryColumn = (x, z, kind, force, dens = 1) => {
    const key = floor(x / 2.3) * 4096 + floor(z / 2.3);
    if (occ.has(key)) return;
    const f = floorsAt(x, z); const c = [];
    for (let i = 0; i < f.length; i += 2) if (f[i + 1] > 9) c.push(i);
    if (!c.length) return;
    const i = c[(rnd() * c.length) | 0], y = f[i];
    if (grad(x, y, z)[1] < 0.55) return;
    if (!force && flyPts.some((p) => hypot(x - p[0], z - p[2]) < 5)) return;
    if (TUNNELS.some((t) => [t.pts[0], t.pts[t.pts.length - 1]].some((e) => hypot(x - e[0], z - e[2]) < 15))) return; // keep tunnel mouths in view
    if (nearNurse(x, z, 8)) return;
    occ.add(key);
    column(x, y - 0.3, z, min(f[i + 1] - rr(0.8, 5), force ? rr(30, 42) : rr(15, 40)), kind, dens);
  };
  // hand-placed columns framing the viewpoints: x, z, kind, density
  for (const p of [[...rel(0, 11, -8.5), 0], [...rel(0, 16, -10.5), 0], [...rel(0, 21, -9), 0], [...rel(0, 9, 7), 0], [...rel(0, 14, 9.5), 0], [...rel(0, 19, 8), 0], [...rel(0, 26, 6), 0],
    [...rel(5, 6.5, 5.2), 1], [...rel(5, 12, 7), 1], [...rel(5, 15, -8), 0], [...rel(5, 22, -5), 1], [...rel(3, 12, -5.5), 0], [...rel(3, 16, 5.5), 0], [...rel(3, 20, -4.5), 0], [...rel(3, 25, 6), 0], [...rel(3, 13, 8), 0], [...rel(3, 30, -7), 0], [24, 62, 1], [-6, 96, 1], [20, 96, 2], [-10, 70, 0], [16, 52, 1],
    [...rel(4, 15, -9), 0, 1.2], [...rel(4, 19, -13), 0, 1.2], [...rel(4, 23, -8.5), 0, 1.2], [...rel(4, 25, -15), 0, 1.2],
    [...rel(4, 25, 0.5), 2, 1.2], [...rel(4, 27, -3), 2, 1.2], [...rel(4, 28, 3.5), 2, 1.2], [...rel(4, 31, 0), 0, 1.3], [...rel(4, 33, -5), 0, 1.3], [...rel(4, 33, 5), 0, 1.3], [...rel(4, 21, 9), 0, 1.2], [...rel(4, 27, 11), 0, 1.2],
    [...rel(2, 6.5, -5.5), 0, 1.5], [...rel(2, 9.5, -8), 0, 1.3], [...rel(2, 8, 6), 0, 1.4], [...rel(2, 12, 3.6), 0, 1.3], [...rel(2, 17, -2.5), 0, 1.2], [...rel(2, 21, 4), 0, 1.2], [...rel(2, 12, -4.5), 2, 1.2], [...rel(2, 27, -9), 0, 1.2], [...rel(2, 30, 8.5), 0, 1.2], [...rel(2, 37, -3), 0, 1.1],
    [...rel(2, 13.5, 6.5), 0, 1.3], [...rel(2, 14.5, -7), 0, 1.3], [...rel(2, 6.5, 6.5), 0, 1.3], [...rel(2, 9, -8), 2, 1.3]]) tryColumn(p[0], p[1], p[2], true, p[3]);
  // random columns across the world
  rseed(2);
  for (let i = 0; i < 15000; i++) {
    const a = rnd() * TAU, r = sqrt(rnd()) * 170, x = cos(a) * r, z = sin(a) * r;
    if (rnd() < kelpDens(x, z)) tryColumn(x, z, zoneP(x, z) > 0.5 && rnd() < 0.5 ? 1 : rnd() < 0.03 ? 2 : 0);
  }

  // --- clusters of ribbon leaves on the ground
  const cluster = (x, y, z, n, type, lmin, lmax, wmin, wmax, tmax, sway) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rnd() * 0.5, L = rr(lmin, lmax);
      leaf(big, x + cos(a) * r, y - 0.15, z + sin(a) * r, L, a, rr(0.05, tmax), rr(wmin, wmax), sway, type, rnd(), rnd(), rr(0.3, 0.8));
    }
  };
  const HOT = [[0, 5, 30], [42, 30, 24], [6, 82, 34], [-58, 10, 24], [4, -88, 30], [-36, 44, 18], [-46, -60, 20]];
  const hot = (x, z) => { let h = 0.4; for (const p of HOT) h = max(h, sstep(p[2], p[2] * 0.4, hypot(x - p[0], z - p[1]))); return h; };
  rseed(3);
  for (let i = 0; i < 40000; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2], ny = T.wn[k + 1];
    if (hypot(x, z) > 172 || y > -6) continue;
    const h = hot(x, z), zp = zoneP(x, z), u = rnd();
    if (nearFly(x, y, z, 4) || hypot(x + 1, z - 2) < 9 || nearPose(x, z, 8)) continue;
    if (ny > 0.75 && u < 0.10 * h) cluster(x, y, z, 8 + rnd() * 14 | 0, 2, 1.0, 3.0, 0.13, 0.26, 0.6, 2.5);
    else if (ny > 0.6 && u < 0.10 * h + 0.07 * max(zp, h * 0.4)) cluster(x, y, z, 10 + rnd() * 18 | 0, rnd() < 0.8 ? 3 : 4, 0.9, 2.6, 0.14, 0.28, 0.9, 1.5);
    else if (ny < -0.35 && u < 0.5 * max(zp, 0.2)) { // hanging fronds
      const n = 12 + rnd() * 20 | 0;
      for (let j = 0; j < n; j++) leaf(big, x + rr(-0.6, 0.6), y + 0.2, z + rr(-0.6, 0.6), rr(0.8, 3.2), rnd() * TAU, PI - rr(0, 0.4), rr(0.08, 0.18), 0, zp > 0.3 || rnd() < 0.5 ? 6 : 0, rnd(), rnd(), rr(0.3, 0.6));
    } else if (ny > -0.2 && ny < 0.8 && u < 0.07) { // wall tufts
      const yaw = atan2(T.wn[k + 2], T.wn[k]), n = 5 + rnd() * 7 | 0;
      for (let j = 0; j < n; j++) leaf(big, x, y, z, rr(0.5, 1.4), yaw + rr(-0.9, 0.9), rr(0.3, 1.1), rr(0.06, 0.12), 0.5, zp > 0.4 && rnd() < 0.6 ? 3 : 0, rnd(), rnd(), rr(0.2, 0.6));
    }
  }
  // --- ground cover: dense carpets of small tufts in the magenta patches
  rseed(4);
  for (const p of MAGENTA) for (let i = p[2] * p[2] * PI * 45; i > 0; i--) {
    const a = rnd() * TAU, r = sqrt(rnd()) * p[2], x = p[0] + cos(a) * r, z = p[1] + sin(a) * r;
    if (rnd() > magAt(x, z) + 0.12 || nearPose(x, z) || nearNurse(x, z, 7)) continue;
    const f = floorsAt(x, z); if (!f.length) continue;
    const y = f[f.length - 2]; if (grad(x, y, z)[1] < 0.7) continue;
    const nl = 2 + (rnd() * 3 | 0), yw = rnd() * TAU;
    for (let j = 0; j < nl; j++) leaf(small, x, y - 0.03, z, rr(0.08, 0.26), yw + j * TAU / nl + rr(-0.4, 0.4), rr(0.15, 0.85), rr(0.035, 0.07), 0, 5, rnd(), rnd(), rr(0.3, 0.7));
    if (rnd() < 0.3) for (let j = 0; j < 2; j++) leaf(small, x + rr(-0.2, 0.2), y - 0.04, z + rr(-0.2, 0.2), rr(0.2, 0.55), rnd() * TAU, rr(0.05, 0.6), rr(0.03, 0.06), 0, 7, rnd(), rnd(), rr(0.3, 0.8));
    if (rnd() < 0.3) glint(x, y + rr(0.08, 0.22), z, 0, rnd(), 0.82 + rnd() * 0.18, rr(0.01, 0.02), 0);
  }
  rseed(5);
  for (let i = 0; i < 620000; i++) {
    const k = pickV(), ny = T.wn[k + 1];
    if (ny < 0.72) continue;
    const x = T.wp[k] + rr(-0.45, 0.45), z = T.wp[k + 2] + rr(-0.45, 0.45), y = T.wp[k + 1];
    if (hypot(x, z) > 170 || nearPose(x, z)) continue;
    const m = magAt(x, z), zp = zoneP(x, z), u = rnd();
    if (m > 0.3 && u < m * 0.9) for (let j = 0; j < 4; j++) leaf(small, x + rr(-0.1, 0.1), y - 0.05, z + rr(-0.1, 0.1), rr(0.12, 0.34), rnd() * TAU, rr(0.05, 0.75), rr(0.04, 0.08), 0, 5, rnd(), rnd(), rr(0.3, 0.7));
    else if (u < m * 0.9 + 0.5 * max(zp, hot(x, z)) * sstep(0.42, 0.6, fbm(x * 0.09, 9, z * 0.09, 2))) for (let j = 0; j < 3; j++) leaf(small, x + rr(-0.1, 0.1), y - 0.05, z + rr(-0.1, 0.1), rr(0.25, 0.7), rnd() * TAU, rr(0.1, 0.8), rr(0.05, 0.1), 0, 7, rnd(), rnd(), rr(0.3, 0.8));
  }

  // --- sponges and coral (clustered on rock)
  const spots = [];
  const ZS = [[-58, 8, 30, 1], [0, 0, 30, 0.7], [6, 84, 36, 0.9], [4, -88, 22, 0.6], [44, 20, 24, 0.5]];
  const zw = (x, z) => { let h = 0.45; for (const p of ZS) h = max(h, p[3] * sstep(p[2], p[2] * 0.4, hypot(x - p[0], z - p[1]))); return h; };
  rseed(6);
  for (let i = 0; i < 13000; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2];
    if (hypot(x, z) > 170 || y > -8 || T.wn[k + 1] < -0.15 || rnd() > zw(x, z) || nearFly(x, y, z, 3)) continue;
    const n0 = [T.wn[k], T.wn[k + 1], T.wn[k + 2]], [t1, t2] = tangent(n0), coral = T.wn[k + 1] > 0.85 || rnd() < 0.35, cnt = coral ? 2 + rnd() * 5 | 0 : 3 + rnd() * 9 | 0, sd = rnd();
    for (let j = 0; j < cnt; j++) {
      const a = rr(-1, 1) * (0.5 + cnt * 0.13), b = rr(-1, 1) * (0.5 + cnt * 0.13);
      const s = snap(x + t1[0] * a + t2[0] * b, y + t1[1] * a + t2[1] * b, z + t1[2] * a + t2[2] * b, n0);
      if (!s) continue;
      let ux = s[3], uy = s[4] + (coral ? 0.9 : 1.1), uz = s[5]; const l = hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
      const q = qMul(qFromY(ux, uy, uz), qAxis(0, 1, 0, rnd() * TAU)), sc = coral ? rr(0.5, 1.5) : rr(0.35, 0.9) * (rnd() < 0.1 ? 1.6 : 1);
      solid(coral ? 7 + (rnd() * 3 | 0) : 4 + (rnd() * 3 | 0), s[0] - ux * 0.12 * sc, s[1] - uy * 0.12 * sc, s[2] - uz * 0.12 * sc, sc, q, coral ? 5 : 4, fract(sd + rr(-0.03, 0.03)), 1, 0);
    }
    if (!coral && rnd() < 0.3) spots.push([x + n0[0], y + n0[1] + 0.5, z + n0[2]]);
  }

  // dense sponge / coral gardens: x, z, radius, count
  rseed(7);
  for (const g of [[-68, -6, 9, 260], [-66, 6, 7, 160], [16, 72, 7, 200], [-6, 74, 6, 120], [-13, -2, 6, 80], [8, -88, 8, 160], [44, 12, 7, 120], [-62, 22, 6, 140], [-47, 40, 6, 140], [-30, 47, 6, 120], [-12, 48, 5, 100], [14, 28, 6, 140], [28, 45, 6, 120], [-36, -76, 6, 130], [-49, -58, 6, 130], [-58, -38, 6, 120]]) {
    let made = 0;
    for (let i = 0; i < 400000 && made < g[3]; i++) {
      const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2];
      if (hypot(x - g[0], z - g[1]) > g[2] || y > -14 || T.wn[k + 1] < -0.1 || nearFly(x, y, z, 2.2)) continue;
      made++;
      const coral = T.wn[k + 1] > 0.85 || rnd() < 0.3, nx = T.wn[k], ny = T.wn[k + 1] + (coral ? 0.9 : 1.1), nz = T.wn[k + 2], l = hypot(nx, ny, nz);
      const sc = coral ? rr(0.5, 1.4) : rr(0.35, 0.9) * (rnd() < 0.15 ? 1.7 : 1);
      solid(coral ? 7 + (rnd() * 3 | 0) : 4 + (rnd() * 3 | 0), x - nx / l * 0.1 * sc, y - ny / l * 0.1 * sc, z - nz / l * 0.1 * sc, sc, qMul(qFromY(nx / l, ny / l, nz / l), qAxis(0, 1, 0, rnd() * TAU)), coral ? 5 : 4, rnd(), 1, 0);
    }
  }
  // --- rocks (every rock rests on the sea floor: nothing floats loose in the water)
  rseed(9);
  for (let i = 0; i < 2600; i++) {
    const k = pickV(); if (T.wn[k + 1] < 0.7 || hypot(T.wp[k], T.wp[k + 2]) > 170 || nearFly(T.wp[k], T.wp[k + 1], T.wp[k + 2], 6) || inTunnel(T.wp[k], T.wp[k + 1], T.wp[k + 2])) continue;
    const sc = rr(0.25, 1.3) * (rnd() < 0.1 ? 2 : 1);
    solid(rnd() * 4 | 0, T.wp[k], T.wp[k + 1] + sc * 0.2, T.wp[k + 2], sc, qRand(), 1, rnd(), 1, 0);
  }

  rseed(10);
  for (let i = 0; i < 60000; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2], ny = T.wn[k + 1];
    if (hypot(x, z) > 172 || y > -3 || (ny > 0.8 && rnd() < 0.6) || nearFly(x, y, z, 3.5) || inTunnel(x, y, z)) continue;
    const sc = (0.35 + 2.1 * pow(rnd(), 2.6)) * (ny > 0.8 ? 0.5 : 1), q = qRand();
    chunks[(sc > 1.15 ? 3 : 0) + (rnd() * 3 | 0)][cellOf(x, z)].push(x - T.wn[k] * sc * 0.3, y - ny * sc * 0.3, z - T.wn[k + 2] * sc * 0.3, sc, q[0], q[1], q[2], q[3], 1, rnd(), sc > 1.15 ? 0 : 96, 0);
  }
  rseed(11);
  for (let i = 0; i < 170000; i++) { // pebbles and rubble on the sea floor
    const k = pickV(), x = T.wp[k] + rr(-0.4, 0.4), z = T.wp[k + 2] + rr(-0.4, 0.4), y = T.wp[k + 1];
    if (T.wn[k + 1] < 0.8 || hypot(x, z) > 170 || nearFly(x, y, z, 1.3) || inTunnel(x, y, z)) continue;
    const sc = 0.05 + 0.3 * pow(rnd(), 2), q = qRand();
    nth++ % THIN || chunks[6][cellOf(x, z)].push(x, y - sc * 0.25, z, sc, q[0], q[1], q[2], q[3], 1, rnd(), 44, 0);
  }
  // --- set pieces
  const gy = (x, z) => { const f = floorsAt(x, z); return f.length ? f[f.length - 2] : -45; };
  solid(10, -5, gy(-5, -4) - 0.6, -4, 1, qMul(qAxis(0, 1, 0, 1.2), qMul(qAxis(0, 0, 1, 0.16), qAxis(1, 0, 0, -0.3))), 2, 0.3, 1, 0);          // whale fluke
  solid(11, 59.5, -23, 6, 1, qMul(qAxis(0, 1, 0, -PI / 2), qMul(qAxis(0, 0, 1, -0.1), qAxis(1, 0, 0, 0.32))), 3, 0.5, 1, 0); // ship hull
  // barrel sponges in front of viewpoint 4, small sponges around the fluke base
  rseed(12);
  for (const b of [[7, 3.2, 1.3, 4], [8.4, 4.6, 1.0, 6], [9.6, 2.6, 1.5, 4], [11, 5, 1.1, 5], [8, -3.6, 1.2, 4], [12.5, 2, 1.2, 6], [9, 3.9, 0.8, 4]]) { const p = rel(3, b[0], b[1]), c = POSES[3]; let ux = (c[0] - p[0]) * 0.07, uz = (c[2] - p[1]) * 0.07; const l = hypot(ux, 1, uz); solid(b[3], p[0], gy(p[0], p[1]) - 0.1, p[1], b[2], qFromY(ux / l, 1 / l, uz / l), 4, rnd(), 1, 0); }
  for (let i = 0; i < 9; i++) { const a = rnd() * TAU; const x = -5 + cos(a) * rr(1.2, 2.6), z = -4 + sin(a) * rr(1.5, 4); solid(6, x, gy(x, z) + 0.05, z, rr(0.4, 0.9), qAxis(0, 1, 0, rnd() * 6), 4, rnd(), 1, 0); }

  // --- nurse sharks: each group is a pile, noses together at the middle and the bodies fanning out like spokes, each
  // bent in an S sideways. Each body is rigid and straight (up and down), tilted to the slope and lying on the ground.
  const nurse = [];
  rseed(16);
  for (const site of nurseSites) {
    const n = 4 + (rnd() * 3 | 0), a0 = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const ang = a0 + i * TAU / n + rr(-0.16, 0.16), ux = sin(ang), uz = cos(ang), sz = rr(0.9, 1.1), bend = (rnd() < 0.5 ? -1 : 1) * rr(0.3, 0.5);
      const yaw = atan2(-ux, -uz), hx = sin(yaw), hz = cos(yaw), gap = 0.1 + rr(0, 0.12);
      const x = site[0] + ux * (gap + NOSE * sz), z = site[2] + uz * (gap + NOSE * sz); // the nose (NOSE body units ahead of this point) lands at the middle
      // the ground under the body's centre line and its two flanks at body z, following the S-curve
      const ground = (zz) => { let m = -1e9; for (const sd of [-0.14, 0, 0.14]) { const dx = bendAt(zz, bend) + sd, f = floorsAt(x + (hx * zz + hz * dx) * sz, z + (hz * zz - hx * dx) * sz); if (!f.length) return null; m = max(m, f[f.length - 2]); } return m; };
      const gk = NURSE_ZK.map(ground);
      if (gk.some((v) => v === null)) continue;
      // one straight, rigid pose: the body's slope is the least-squares slope of the ground along it, and it is then set so the
      // belly just touches the highest ground under it (it never sinks in)
      const belly = (zz) => 0.52 * nurseAt(nurseZ0(zz))[0], zw = NURSE_ZK.map((q) => q * sz), want = gk.map((g, k) => g + belly(NURSE_ZK[k]) * sz);
      const zm = zw.reduce((s, v) => s + v, 0) / 8, hm = want.reduce((s, v) => s + v, 0) / 8;
      let cv = 0, vr = 0; for (let k = 0; k < 8; k++) { cv += (zw[k] - zm) * (want[k] - hm); vr += (zw[k] - zm) ** 2; }
      const slope = cv / vr, pitch = Math.atan(slope), y = max(...want.map((v, k) => v - slope * zw[k]));
      const hover = max(...want.map((v, k) => y + slope * zw[k] - v)); // how far the body hovers over the lowest ground under it
      if (abs(slope) > 0.3 || hover > 0.22) continue;
      if (![[0.9, 0.2], [0.2, 0.25], [-0.6, 0.2], [-1.4, 0.15]].every(([d, up]) => { const dx = bendAt(d, bend); return Dw(x + (hx * d + hz * dx) * sz, y + up + slope * d * sz, z + (hz * d - hx * dx) * sz) < -0.1; })) continue;
      nurse.push(x, y, z, yaw, pitch, sz, rnd(), bend, 0, 0, 0, 0, 0, 0, 0, 0);
    }
  }

  // --- blacktip reef sharks (half the size of the big ones): start on open sea floor, away from tunnels and the sleeping nurse sharks
  // how thickly tall plants (kelp and long ribbon leaves) grow in each cell, 0..255; the blacktips swim through sparse plants but
  // turn away from cells at PLANT_DENSE and above
  const plantMap = new Uint8Array(PMN * PMN);
  for (let j = 0; j < PMN; j++) for (let i = 0; i < PMN; i++) plantMap[i + PMN * j] = min(255, plantW[i + PMN * j]);
  const plantNear = (x, z) => { const i = floor((x + 160) / 2.5), j = floor((z + 160) / 2.5); return i < 0 || i >= PMN || j < 0 || j >= PMN || plantMap[i + PMN * j] >= PLANT_DENSE / 3; };
  const pups = [], freeP = (x, y, z, m) => Dw(x, y, z) < -m;
  rseed(17);
  for (let tries = 0; tries < 4000 && pups.length < 3 * 8; tries++) {
    const ang = rnd() * TAU, r = rr(25, 120), x = cos(ang) * r, z = sin(ang) * r;
    if (nearNurse(x, z, 10) || pups.some((_, k) => k % 8 === 0 && hypot(x - pups[k], z - pups[k + 2]) < 40)) continue;
    const f = floorsAt(x, z); if (f.length !== 2 || f[0] > -38) continue; // open sea floor only, not the top of a rock
    const y = f[0] + 1.3;
    if (plantNear(x, z) || [6, 12].some((d) => [0, 1, 2, 3, 4, 5, 6, 7].some((a) => plantNear(x + cos(a * TAU / 8) * d, z + sin(a * TAU / 8) * d)))) continue; // only wide-open areas
    let ok = true; for (let a = 0; a < 8 && ok; a++) for (const d of [3, 7]) if (!freeP(x + cos(a * TAU / 8) * d, y, z + sin(a * TAU / 8) * d, 0.85) || plantNear(x + cos(a * TAU / 8) * d, z + sin(a * TAU / 8) * d) || tunnelDark(x + cos(a * TAU / 8) * d, y, z + sin(a * TAU / 8) * d) > 0.01) ok = false;
    if (!ok || tunnelDark(x, y, z) > 0.01) continue;
    pups.push(x, y, z, rnd() * TAU, 0, rr(1.35, 1.65), rnd() * TAU, 0);
  }

  // --- floor life and reef forms. 12 floats each, like the sponges: x y z scale | quaternion | material, seed, texture scale, bob
  // kinds: 0 urchin, 1 starfish, 2 shell, 3 sea cucumber, 4 garden eel, 5 table coral, 6 brain coral, 7 anemone
  const FL = Array.from({ length: 8 }, () => []);
  rseed(20);
  const sandA = (x, z) => sstep(0.42, 0.6, fbm(x * 0.04, 3, z * 0.04, 3));
  const putF = (k, x, y, z, sc, mat, n, upish) => { const u = upish ? [n[0] * 0.3, 1, n[2] * 0.3] : n, q = qMul(qFromY(u[0], u[1], u[2]), qAxis(0, 1, 0, rnd() * TAU)); FL[k].push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, rnd(), 1, 0); };
  const okSpot = (x, y, z) => hypot(x, z) < 165 && !nearNurse(x, z, 6) && tunnelDark(x, y, z) < 0.01 && !flyPts.some((p) => hypot(x - p[0], z - p[2]) < 3);
  const want = { 0: 170, 1: 130, 2: 260, 3: 90, 5: 80, 6: 110 }, got = [0, 0, 0, 0, 0, 0, 0, 0], clusterAt = [];
  for (let tries = 0; tries < 60000; tries++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2], ny = T.wn[k + 1], n = [T.wn[k], ny, T.wn[k + 2]]; if (!okSpot(x, y, z)) continue;
    const sa = sandA(x, z), r = rnd();
    if (ny > 0.9 && y < -26 && sa > 0.35) { // flat sand: shells, starfish, sea cucumbers
      if (r < 0.35 && got[2] < want[2]) { putF(2, x, y + 0.004, z, rr(0.7, 1.3), 8, n, false); got[2]++; }
      else if (r < 0.5 && got[1] < want[1]) { putF(1, x, y, z, rr(0.7, 1.4), 7, n, false); got[1]++; }
      else if (r < 0.58 && got[3] < want[3]) { putF(3, x, y, z, rr(0.8, 1.5), 9, n, false); got[3]++; }
    }
    if (ny > 0.35 && ny < 0.97 && y < -20 && got[0] < want[0] && r < 0.12) { // urchins on rock, in small groups
      for (let q = 0, c = 2 + (rnd() * 4 | 0); q < c; q++) { const px = x + rr(-0.6, 0.6), pz = z + rr(-0.6, 0.6), f = floorsAt(px, pz); if (f.length) { putF(0, px, f[f.length - 2], pz, rr(0.7, 1.3), 6, n, true); got[0]++; } }
    }
    if (ny > 0.6 && y > -42 && y < -12 && r > 0.9) { // reef forms on rock
      if (got[5] < want[5] && rnd() < 0.5) { putF(5, x, y - 0.03, z, rr(0.7, 1.5), 13, n, true); got[5]++; }
      else if (got[6] < want[6]) { putF(6, x, y - 0.02, z, rr(0.7, 1.4), 11, n, true); got[6]++; }
      else if (got[7] < 40 && rnd() < 0.4) { putF(7, x, y - 0.02, z, rr(0.8, 1.3), 12, n, true); got[7]++; clusterAt.push([x, y, z]); }
    }
  }
  // garden eel colonies: dozens of eels in a few patches of flat, open sand (they sink into it when you come close)
  const colonies = [];
  for (let tries = 0; tries < 20000 && colonies.length < 9; tries++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2]; if (T.wn[k + 1] < 0.95 || y > -30 || y < -48 || sandA(x, z) < 0.5 || !okSpot(x, y, z) || plantNear(x, z) || colonies.some((c) => hypot(x - c[0], z - c[1]) < 25)) continue;
    colonies.push([x, z]);
    for (let q = 0, c = 28 + (rnd() * 24 | 0); q < c; q++) { const a = rnd() * TAU, d = sqrt(rnd()) * 3.2, px = x + cos(a) * d, pz = z + sin(a) * d, f = floorsAt(px, pz); if (f.length === 2 && abs(f[0] - y) < 0.4) { FL[4].push(px, f[0] - 0.05, pz, rr(0.55, 1.1), 0, 0, 0, 1, 10, rnd(), 1, 0); } }
  }

  // --- bubbles
  const VENTS = [[4, -44, -3], [4.5, -44, -3.5], [-1, -44, 2], [2, -44, -1], [5.5, -44, -7], [3, -44, -9], [6, -44, -90], [8, -44, -84], [4, -44, -93], [-9, -44, 3], [5, -35, -86], [9, -37, -92], [40, -44, 20], [-56, -44, 12], [10, -44, 80], [-2, -44, 30], [0, -44, -30], [12, -44, 2], [6, -44, -2], [46, -44, 30], [-20, -44, -103], [-52, -44, -12], [4, -44, 70], [9, -44, -74], [4, -44, -78], [14, -44, 26], [26, -44, 40], [-45, -44, -64], [-55, -44, -40], [-58, -44, 22], [-40, -44, 40], [-14, -44, 45], [-1, -44, -9], [-7, -44, -6]];
  rseed(13);
  for (const s of spots) if (rnd() < 0.28) VENTS.push(s);
  for (const v of VENTS) {
    const n = 90 + rnd() * 70 | 0, y0 = v[1] === -44 ? gy(v[0], v[2]) : v[1];
    for (let i = 0; i < n; i++) {
      const sz = rnd() < 0.24 ? rr(0.1, 0.3) : rr(0.025, 0.08);
      bubbles.push(v[0] + rr(-0.3, 0.3), y0, v[2] + rr(-0.3, 0.3), sz, rnd(), rr(1.1, 2.4) * (0.6 + sz * 3), -y0 - 0.2, rr(0.05, 0.16));
    }
  }

  // --- pack leaves (36 bytes: 8 floats + 4 unorm8), sorted by culling cell
  const pack = (L, step = 1, wm = 1) => {
    let n = 0; const start = new Uint32Array(nCells + 1);
    for (let c = 0; c < nCells; c++) { start[c] = n; n += Math.ceil(L[c].length / 12 / step); }
    start[nCells] = n;
    const buf = new ArrayBuffer(n * 36), f = new Float32Array(buf), u8 = new Uint8Array(buf), lo = new Float32Array(nCells).fill(1e9), hi = new Float32Array(nCells).fill(-1e9);
    let k = 0;
    for (let c = 0; c < nCells; c++) { const a = L[c]; for (let i = 0; i < a.length; i += 12 * step, k++) {
      for (let j = 0; j < 8; j++) f[k * 9 + j] = a[i + j];
      f[k * 9 + 6] *= wm;
      u8[k * 36 + 32] = a[i + 8]; u8[k * 36 + 33] = a[i + 9] * 255; u8[k * 36 + 34] = a[i + 10] * 255; u8[k * 36 + 35] = a[i + 11] * 255;
      const y = a[i + 1], l = a[i + 3]; if (y - l < lo[c]) lo[c] = y - l; if (y + l > hi[c]) hi[c] = y + l;
    } }
    return { buf, n, start, lo, hi };
  };

  // --- half-res volume: r = openness, g = skylight
  const hx = NX / 2, hy = NY / 2, hz = NZ / 2, volD = new Uint8Array(hx * hy * hz * 4);
  let Lp = new Float32Array(hx * hz).fill(1), Ln = new Float32Array(hx * hz), tmp = new Float32Array(hx * hz);
  for (let y = hy - 1; y >= 0; y--) {
    for (let z = 0; z < hz; z++) for (let x = 0; x < hx; x++) { const i = x + hx * z; tmp[i] = (Lp[x > 0 ? i - 1 : i] + 2 * Lp[i] + Lp[x < hx - 1 ? i + 1 : i]) * 0.25; }
    for (let z = 0; z < hz; z++) for (let x = 0; x < hx; x++) {
      const i = x + hx * z, b = (tmp[z > 0 ? i - hx : i] + 2 * tmp[i] + tmp[z < hz - 1 ? i + hx : i]) * 0.25;
      const g0 = gi(x * 2, y * 2, z * 2);
      const d = (D[g0] + D[g0 + 1] + D[g0 + NX] + D[g0 + NX + 1] + D[g0 + NX * NY] + D[g0 + NX * NY + 1] + D[g0 + NX * NY + NX] + D[g0 + NX * NY + NX + 1]) * 0.125;
      const o = x + hx * (y + hy * z);
      const l = b * clamp(0.5 - d / 1.5, 0, 1) * (1 - min(kelpAbs[o], 0.5));
      Ln[i] = l;
      volD[o * 4] = clamp(0.5 - d / 12, 0, 1) * 255; volD[o * 4 + 1] = min(1, b) * 255;
    }
    const t = Lp; Lp = Ln; Ln = t;
  }

  // darkness inside the tunnels (b channel; the volume's voxels are 1.5 m, centred 0.75 m in from the corner at -192, -56, -192)
  for (const t of TUNNELS) for (let i = 0; i < t.pts.length - 1; i++) {
    const a = t.pts[i], b = t.pts[i + 1], m = t.r * 1.5 + 2.5;
    const lo = [0, 1, 2].map((k) => min(a[k], b[k]) - m), hi = [0, 1, 2].map((k) => max(a[k], b[k]) + m), org = [-192, -56, -192];
    const i0 = [0, 1, 2].map((k) => clamp(floor((lo[k] - org[k]) / 1.5), 0, [hx, hy, hz][k] - 1)), i1 = [0, 1, 2].map((k) => clamp(floor((hi[k] - org[k]) / 1.5), 0, [hx, hy, hz][k] - 1));
    for (let z = i0[2]; z <= i1[2]; z++) for (let y = i0[1]; y <= i1[1]; y++) for (let x = i0[0]; x <= i1[0]; x++) {
      const o = (x + hx * (y + hy * z)) * 4 + 2, v = tunnelDark(org[0] + (x + 0.5) * 1.5, org[1] + (y + 0.5) * 1.5, org[2] + (z + 0.5) * 1.5) * 255;
      if (v > volD[o]) volD[o] = v;
    }
  }

  // --- ground map: r magenta cover, b purple zone, a sand
  const GM = 1024, gm = new Uint8Array(GM * GM * 4); // 0.375 m per pixel; r magenta cover, g contact shadow, b purple zone, a sand
  for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) {
    const x = (i + 0.5) / 512 * 384 - 192, z = (j + 0.5) / 512 * 384 - 192, r = magAt(x, z) * 255, b = zoneP(x, z) * 255, a = sstep(0.42, 0.6, fbm(x * 0.04, 3, z * 0.04, 3)) * 255;
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) { const o = ((2 * i + di) + GM * (2 * j + dj)) * 4; gm[o] = r; gm[o + 2] = b; gm[o + 3] = a; }
  }
  // contact shadows (g): soft dark blobs where things rest on the ground: the sleeping nurse sharks, loose rocks and boulders
  const stamp = (x, z, rad, val) => {
    const k = GM / 384, ci = (x + 192) * k, cj = (z + 192) * k, rp = rad * k;
    for (let j = max(0, floor(cj - rp)); j <= min(GM - 1, Math.ceil(cj + rp)); j++) for (let i = max(0, floor(ci - rp)); i <= min(GM - 1, Math.ceil(ci + rp)); i++) {
      const d = hypot(i + 0.5 - ci, j + 0.5 - cj) / rp; if (d >= 1) continue;
      const o = (i + GM * j) * 4 + 1, v = val * (1 - d) * (1 - d) * 255; if (v > gm[o]) gm[o] = v;
    }
  };
  for (let o = 0; o < nurse.length; o += 16) {
    const x = nurse[o], z = nurse[o + 2], yw = nurse[o + 3], sz = nurse[o + 5], bd = nurse[o + 7], hx = sin(yw), hz = cos(yw);
    for (let zz = -1.7; zz <= 1.1; zz += 0.15) { const bn = bendAt(zz, bd), wd = zz > -1.55 ? nurseAt(nurseZ0(zz))[1] : 0.05; stamp(x + (hx * zz + cos(yw) * bn) * sz, z + (hz * zz - sin(yw) * bn) * sz, max(0.3, wd * 1.5 + 0.2) * sz, 0.85); }
  }
  for (let k = 0; k < 6; k++) for (const cell of chunks[k]) for (let o = 0; o < cell.length; o += 12) stamp(cell[o], cell[o + 2], cell[o + 3] * 0.9, 0.45);
  for (let mI = 0; mI < 4; mI++) for (const a of (solids[mI] || []).reduce((acc, _, idx, arr) => (idx % 12 === 0 ? acc.concat([arr.slice(idx, idx + 12)]) : acc), [])) stamp(a[0], a[2], a[3] * 1.0, 0.5);

  // --- fish schools + mantas
  // Their paths are formulas run on the GPU, so they know nothing of the rock: each orbit is checked against the terrain here
  // (it is moved or shrunk until clear) and any fish whose own path would still touch rock is left out
  const free = (x, y, z, m) => Dw(x, y, z) < -m;
  const fitOrbit = (c, zs, ay, m) => {
    const ok = (cx, cy, cz, r) => { for (let k = 0; k < 72; k++) { const a = k / 72 * TAU, x = cx + r * cos(a), z = cz + r * zs * sin(a); for (const dy of [-ay, 0, ay]) if (!free(x, cy + dy, z, m)) return false; } return true; };
    for (const sc of [1, 0.85, 0.7, 0.55, 0.42]) for (const dy of [0, 4, -4, 8]) for (const sh of [0, 5, 10, 18]) for (let j = 0; j < (sh ? 12 : 1); j++) {
      const a = j / 12 * TAU, cx = c[0] + cos(a) * sh, cz = c[2] + sin(a) * sh, cy = c[1] + dy;
      if (cy + ay < -2 && cy - ay > -50 && ok(cx, cy, cz, c[3] * sc)) return [cx, cy, cz, c[3] * sc];
    }
    return c;
  };
  // sharks and rays: the whole body (every ellipsoid's extremes plus fin and wing tips) over a full lap must stay at least
  // 1 m clear of rock and under the surface; an orbit that can't be made to fit by moving or shrinking it is dropped
  const BODY_X = { shark: [[0, .6, -.1], [0, .45, -1.42], [.25, .4, -1.42], [-.25, .4, -1.42], [.66, -.4, -.15], [-.66, -.4, -.15], [0, .02, 1.02]], manta: [[1, .4, 0], [-1, .4, 0], [1, -.3, 0], [-1, -.3, 0], [0, 0, -1.95]] };
  const bodyClear = (p, manta) => {
    const pts = []; for (const e of manta ? MANTA_E : SHARK_E) { pts.push([e[0], e[1], e[2]]); for (const s of [-1, 1]) pts.push([e[0] + s * e[3], e[1], e[2]], [e[0], e[1] + s * e[4], e[2]], [e[0], e[1], e[2] + s * e[5]]); }
    pts.push(...(manta ? BODY_X.manta : BODY_X.shark));
    const sz = p[6];
    for (let k = 0; k < 120; k++) {
      bodyPose(p, 0, (k / 120 * TAU - p[4]) / p[5], manta);
      for (const q of pts) {
        const y = BP[1] + (BP[4] * q[0] + BP[7] * q[1] + BP[10] * q[2]) * sz;
        if (y > -1.5 || !free(BP[0] + (BP[3] * q[0] + BP[6] * q[1] + BP[9] * q[2]) * sz, y, BP[2] + (BP[5] * q[0] + BP[8] * q[1] + BP[11] * q[2]) * sz, 1)) return false;
      }
    }
    return true;
  };
  const fitBody = (p, manta) => {
    for (const sc of [1, 0.85, 0.7, 0.55, 0.42]) for (const dy of [0, 4, -4, 8, -8]) for (const sh of [0, 5, 10, 18, 28]) for (let j = 0; j < (sh ? 12 : 1); j++) {
      const a = j / 12 * TAU, q = p.slice(); q[0] += cos(a) * sh; q[2] += sin(a) * sh; q[1] += dy; q[3] *= sc;
      if (bodyClear(q, manta)) return q;
    }
    return null;
  };
  const hsj = (x) => fract(sin(x * 127.1) * 43758.5453);
  // the same path the fish vertex shader draws, sampled over ~12 minutes
  const fishClear = (f) => {
    const [cx, cy, cz, R, s, om, , ss] = f, h0 = hsj(s), h1 = hsj(s + 0.37), h2 = hsj(s + 0.71), sg = om < 0 ? -1 : 1;
    for (let k = 0; k < 96; k++) {
      const t = k * 7.3, ta = t * om + ss * 6.3 + (h0 - 0.5) * (26 / R), ph = ss * 17;
      const px = cx + R * cos(ta), py = cy + 2.2 * sin(3 * ta + ph), pz = cz + R * 0.6 * sin(ta);
      let tx = -R * sin(ta), ty = 6.6 * cos(3 * ta + ph), tz = R * 0.6 * cos(ta); const tl = hypot(tx, ty, tz); tx *= sg / tl; ty *= sg / tl; tz *= sg / tl;
      let sx = tz, sz = -tx; const sl = hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      const ux = ty * sz, uy = tz * sx - tx * sz, uz = -ty * sx;
      const a = (h1 - 0.5) * 5 + sin(t * 0.6 + s * 40) * 0.5, b = (h2 - 0.5) * 3.2 + cos(t * 0.5 + s * 31) * 0.4;
      if (!free(px + sx * a + ux * b, py + uy * b, pz + sz * a + uz * b, 0.7)) return false;
    }
    return true;
  };
  const fish = [];
  rseed(14);
  const SCH = [[-2, -36, -10, 15, 520, 0.3, 1, 0.945], [8, -30, -70, 22, 420, 0.32, -1], [48, -30, 14, 18, 360, 0.3, 1], [-58, -30, -8, 11, 420, 0.28, -1, 0.3], [8, -36, 84, 16, 320, 0.28, 1],
    [-90, -28, -70, 25, 300, 0.3, 1], [95, -30, 70, 25, 300, 0.3, -1], [0, -22, 20, 30, 380, 0.34, -1], [-30, -30, -100, 18, 300, 0.3, 1], [16, -36, 30, 12, 300, 0.3, 1], [-48, -34, -58, 12, 300, 0.3, -1], [-45, -35, 38, 14, 320, 0.3, 1]];
  for (const s0 of SCH) {
    const s = s0.slice(), o = fitOrbit([s[0], s[1], s[2], s[3]], 0.6, 3.6, 2.2); s[0] = o[0]; s[1] = o[1]; s[2] = o[2]; s[3] = o[3];
    const ss = s[7] === undefined ? rnd() : s[7];
    for (let i = 0; i < s[4]; i++) { const f = [s[0], s[1], s[2], s[3], rnd(), s[6] * 1.9 / s[3], s[5], ss]; if (fishClear(f)) fish.push(...f); }
  }
  const mantas = [];
  for (const m of [[1, -28, 3.5, 14, 3.012, 0.085, 3.6, 0.1], [49, -31, 24.5, 5, 0.029, -0.08, 3.7, 0.4], [0, -14, -80, 34, 0.3, 0.06, 5.2, 0.7], [-50, -18, 20, 26, 5, -0.075, 3.8, 0.55], [10, -16, 86, 26, 2.2, 0.07, 4.4, 0.85], [20, -11, -20, 46, 4.2, -0.045, 5.6, 0.25]]) { const o = fitBody(m.slice(), 1); if (o) mantas.push(...o); }

  // sharks: x, y, z, orbit radius, phase, angular speed (sign = direction), size, seed. Orbits shadow the mantas' (all known to be clear of rock), slightly tighter
  const sharks = [];
  for (const s of [[-50, -15, 20, 23, 1.3, 0.1, 3, 0.15], [10, -13, 86, 23, 4.1, -0.09, 3.2, 0.4], [0, -11, -80, 30, 2.2, 0.075, 3.6, 0.65], [20, -8, -20, 40, 0.5, -0.06, 4.4, 0.9], [1, -25, 3.5, 12.5, 5.2, -0.12, 2.6, 0.3]]) { const o = fitBody(s.slice(), 0); if (o) sharks.push(...o); }
  // clownfish pairs around some of the anemones (a tight orbit; the school seed above 1.5 marks them for the shader)
  rseed(21);
  for (const c of clusterAt.slice(0, 22)) for (let q = 0; q < 2; q++) fish.push(c[0], c[1] + 0.32, c[2], rr(0.45, 0.7), rnd(), (q ? -1 : 1) * 1.9 / 0.55, 0.13, 2 + rnd());

  // --- drifting particles
  const snow = new Float32Array(9000 * 4);
  for (let i = 0; i < snow.length; i++) snow[i] = rnd();

  const sol = { data: [], ranges: [] }; let si = 0;
  for (let m = 0; m < 12; m++) { const a = solids[m] || []; sol.ranges.push([si, a.length / 12]); si += a.length / 12; for (let i = 0; i < a.length; i++) sol.data.push(a[i]); }
  const packC = (L) => {
    let n = 0; const start = new Uint32Array(nCells + 1);
    for (let c = 0; c < nCells; c++) { start[c] = n; n += L[c].length / 12; }
    start[nCells] = n;
    const data = new Float32Array(n * 12), lo = new Float32Array(nCells).fill(1e9), hi = new Float32Array(nCells).fill(-1e9);
    let k = 0;
    for (let c = 0; c < nCells; c++) { const a = L[c]; for (let i = 0; i < a.length; i += 12) { for (let j = 0; j < 12; j++) data[k++] = a[i + j]; lo[c] = min(lo[c], a[i + 1] - 3); hi[c] = max(hi[c], a[i + 1] + 3); } }
    return { data, n, start, lo, hi };
  };
  // --- the map circle: a top-down picture of the whole arena (seabed depth with relief shading, rock reaching the surface
  // in sand colour), 128 x 128 samples over x, z in [-160, 160]
  const MN = 128, MR = 160, mh = new Float32Array(MN * MN), mt = new Float32Array(MN * MN), mapImg = new Uint8ClampedArray(MN * MN * 4);
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
    const f = floorsAt((i + 0.5) / MN * 2 * MR - MR, (j + 0.5) / MN * 2 * MR - MR);
    mh[i + MN * j] = f.length ? f[f.length - 2] : -48; mt[i + MN * j] = f.length ? f[0] : -48;
  }
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
    const o = (i + MN * j) * 4, x = (i + 0.5) / MN * 2 * MR - MR, z = (j + 0.5) / MN * 2 * MR - MR, r = hypot(x, z);
    const H = (a, b) => mh[clamp(a, 0, MN - 1) + MN * clamp(b, 0, MN - 1)];
    const t = pow(clamp(-mh[i + MN * j] / 44, 0, 1), 0.8), rel = clamp(1 + (H(i - 1, j) - H(i + 1, j) + H(i, j - 1) - H(i, j + 1)) * 0.05, 0.55, 1.45);
    let c = [mix(0.62, 0.06, t), mix(0.92, 0.27, t), mix(0.92, 0.46, t)];
    const sand = sstep(-5, -1.5, mt[i + MN * j]); c = c.map((v, k) => mix(v, [0.86, 0.82, 0.68][k], sand));
    const dim = r > 152 ? 0.5 : 1;
    for (let k = 0; k < 3; k++) mapImg[o + k] = clamp(c[k] * rel * dim * 255, 0, 255);
    mapImg[o + 3] = r <= MR ? 255 : 0;
  }
  return { mapImg, mapH: mh, mapT: mt, nurse: new Float32Array(nurse), floorL: FL.map((a) => new Float32Array(a)), pups: new Float32Array(pups), plantMap, gy, glints: new Float32Array(glints), chunks: chunks.map(packC), props: props.map(packC), big: pack(big), bigF: pack(big, 2, 1.5), small: pack(small), solids: { data: new Float32Array(sol.data), ranges: sol.ranges }, bubbles: new Float32Array(bubbles), volD, gm, fish: new Float32Array(fish), mantas: new Float32Array(mantas), sharks: new Float32Array(sharks), snow };
}
const fract = (x) => x - floor(x);

// ---------------------------------------------------------------- procedural meshes
function meshChunk(sd, sub = 2, det = sub > 2) {
  if (LV > 1 && sub > 1) sub--; // Low: a quarter of the triangles
  rseed(100 + sd);
  const pl = []; for (let i = 0; i < 4; i++) { const q = qRand(); pl.push([q[0], q[1], q[2], rr(0.8, 0.98)]); const l = hypot(q[0], q[1], q[2]) || 1; pl[i][0] /= l; pl[i][1] /= l; pl[i][2] /= l; }
  return icosphere(sub, (x, y, z) => {
    let r = 1 + (fbm(x * 1.6 + sd, y * 1.6, z * 1.6, 2) - 0.5) * 0.9 + (det ? (fbm(x * 4 + sd, y * 4, z * 4, 2) - 0.5) * 0.25 : 0);
    let px = x * r, py = y * r * 0.8, pz = z * r;
    for (const p of pl) { const d = px * p[0] + py * p[1] + pz * p[2] - p[3]; if (d > 0) { px -= p[0] * d; py -= p[1] * d; pz -= p[2] * d; } }
    return [px, py, pz];
  });
}
function meshLathe(prof, seg, lump, ribs = 0) {
  const m = new Mesh(), rings = [];
  for (const [r, h, ao] of prof) { const ring = []; for (let s = 0; s < seg; s++) { const a = s / seg * TAU, rl = r * (1 + lump * (fbm(cos(a) * 1.5 + h * 2, h * 3, sin(a) * 1.5, 2) - 0.5) + 0.07 * cos(ribs * a + h * 1.5)); ring.push(m.v(cos(a) * rl, h, sin(a) * rl, ao)); } rings.push(ring); }
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < seg; s++) { const s2 = (s + 1) % seg; m.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]); }
  return m;
}
function meshCoral(fan, lo = LV > 1) {
  rseed(200 + fan);
  const m = new Mesh();
  const nrm = (v) => { const l = hypot(...v) || 1; return v.map((c) => c / l); };
  const br = (p, d, r, len, depth) => {
    const pts = [p]; let q = p;
    for (let i = 0; i < 3; i++) { d = nrm([d[0] + rr(-0.3, 0.3), d[1] + rr(-0.1, 0.3), d[2] + (fan ? rr(-0.05, 0.05) : rr(-0.3, 0.3))]); q = [q[0] + d[0] * len / 3, q[1] + d[1] * len / 3, q[2] + d[2] * len / 3]; pts.push(q); }
    if (!depth) pts.push([q[0] + d[0] * r * 1.6, q[1] + d[1] * r * 1.6, q[2] + d[2] * r * 1.6]);
    if (lo) m.tube(depth ? [pts[0], pts[3]] : [pts[0], pts[3], pts[4]], (k) => (k > 1 ? r * 0.36 : r * (1 - 0.22 * k)) * 1.25, 3, true, (k) => clamp(1 - (depth + 1 - k) / 5, 0, 1));
    else m.tube(pts, (k) => k > 3 ? r * 0.36 : r * (1 - 0.22 * k / 3), fan ? 5 : 6, true, (k) => clamp(1 - (depth + 1 - k / 3) / 5, 0, 1));
    if (depth > 0) { const n = 2 + (rnd() < 0.5); for (let i = 0; i < n; i++) br(q, nrm([d[0] + rr(-0.8, 0.8), d[1] + rr(-0.1, 0.5), d[2] + (fan ? rr(-0.08, 0.08) : rr(-0.8, 0.8))]), r * 0.78, len * 0.8, depth - 1); }
  };
  const n0 = fan ? 1 : 2 + (rnd() * 2 | 0);
  for (let i = 0; i < n0; i++) br([rr(-0.08, 0.08), 0, rr(-0.08, 0.08)], nrm([rr(-0.5, 0.5), 1, fan ? 0 : rr(-0.5, 0.5)]), fan ? 0.06 : 0.08, fan ? 0.5 : 0.45, 3);
  return m;
}
function meshTubes() {
  rseed(210);
  const m = new Mesh();
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, r0 = rr(0, 0.28), h = rr(0.45, 1.1), rad = rr(0.07, 0.12), lean = rr(0.05, 0.3), pts = [];
    for (let k = 0; k <= 4; k++) pts.push([cos(a) * (r0 + lean * k / 4 * h), h * k / 4, sin(a) * (r0 + lean * k / 4 * h)]);
    m.tube(pts, (k) => rad * (0.8 + 0.25 * k / 4), 12, false, (k) => 0.35 + 0.65 * k / 4);
    // rim + dark throat
    const e = pts[4], n = m.p.length / 3, c = m.v(e[0], e[1] - rad * 1.2, e[2], 0.05);
    for (let s2 = 0; s2 < 12; s2++) m.tri(n - 12 + s2, n - 12 + (s2 + 1) % 12, c);
  }
  return m;
}
// stone whale fluke: SDF of tapered capsules -> surface nets
function meshFluke() {
  const C = [];
  const chain = (pts, zs) => { for (let i = 0; i < pts.length - 1; i++) C.push([...pts[i], ...pts[i + 1], zs]); };
  chain([[0, -1.6, 3.7, 1.2], [0, 1.8, 2.35, 0.98], [0, 4.6, 1.0, 0.76], [0, 6.9, 0.1, 0.6]], 0.8);
  chain([[0, 6.6, 0.1, 0.72], [1.9, 7.9, 0, 0.98], [3.9, 8.8, -0.1, 0.9], [5.7, 9.8, -0.25, 0.64], [7.0, 11.2, -0.4, 0.38], [7.7, 12.8, -0.55, 0.2], [7.9, 14.1, -0.65, 0.1]], 0.18);
  chain([[0, 6.6, 0.1, 0.72], [-1.7, 8.3, 0.05, 0.96], [-3.3, 9.7, -0.05, 0.88], [-4.7, 11.2, -0.2, 0.64], [-5.6, 12.9, -0.4, 0.38], [-6.0, 14.6, -0.5, 0.2], [-5.9, 15.9, -0.6, 0.1]], 0.18);
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const c of C) {
      const zs = c[8], pz = z / zs, az = c[2] / zs, bz = c[6] / zs;
      const bax = c[4] - c[0], bay = c[5] - c[1], baz = bz - az, pax = x - c[0], pay = y - c[1], paz = pz - az;
      const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
      const e = (hypot(pax - bax * h, pay - bay * h, paz - baz * h) - mix(c[3], c[7], h)) * zs;
      const k = 0.45, hh = max(k - abs(d - e), 0) / k;
      d = min(d, e) - hh * hh * k * 0.25;
    }
    return d;
  };
  const vs = 0.09, ox = -7.6, oy = -2.6, oz = -2.2, nx = 186, ny = 216, nz = 76, D = new Float32Array(nx * ny * nz);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) D[x + nx * (y + ny * z)] = -sdf(ox + x * vs, oy + y * vs, oz + z * vs);
  const sn = surfaceNets(D, nx, ny, nz), smp = sampler3(D, nx, ny, nz);
  const vb = new ArrayBuffer(sn.nv * 16), f = new Float32Array(vb), s = new Int8Array(vb);
  for (let k = 0; k < sn.nv; k++) {
    const x = sn.pos[k * 3], y = sn.pos[k * 3 + 1], z = sn.pos[k * 3 + 2], e = 0.7;
    let ax = smp(x - e, y, z) - smp(x + e, y, z), ay = smp(x, y - e, z) - smp(x, y + e, z), az = smp(x, y, z - e) - smp(x, y, z + e);
    const l = hypot(ax, ay, az) || 1;
    f[k * 4] = ox + x * vs; f[k * 4 + 1] = oy + y * vs; f[k * 4 + 2] = oz + z * vs;
    s[k * 16 + 12] = round(ax / l * 127); s[k * 16 + 13] = round(ay / l * 127); s[k * 16 + 14] = round(az / l * 127); s[k * 16 + 15] = 127;
  }
  return { vb, ib: new Uint32Array(sn.idx), nv: sn.nv };
}
// sunken ship (bow at +x): keel with stem and stern posts, curved ribs, hull planking with a breach,
// raised stern castle with transom, deck remnants, two masts with yards, bowsprit
function meshShip() {
  rseed(220);
  const m = new Mesh(), Lh = 17, B = 5.6, Dp = 7.6;
  const hb = (x) => B * pow(max(1 - pow(abs(x / Lh), x < 0 ? 3.6 : 2.6), 0), 0.5);
  const dp = (x) => Dp * (1 - 0.36 * pow(abs(x / Lh), 2.5));
  const sheer = (x) => 0.5 + (x > 0 ? 3.0 : 3.8) * pow(abs(x / Lh), 2.2);
  const pt = (x, ph, off = 0) => { const b = hb(x) + off, d = dp(x) + off, s = sheer(x); return [x, s - (d + s) * pow(max(cos(ph), 0), 0.66), b * Math.sign(ph) * pow(abs(sin(ph)), 0.8)]; };
  const out = (p) => { const l = hypot(p[1] + 0.5, p[2] * 1.3) || 1; return [0, (p[1] + 0.5) / l, p[2] * 1.3 / l]; };
  const up = () => [0, 1, 0];
  const keel = [];
  for (let i = 0; i <= 44; i++) { const x = mix(-Lh - 1.0, Lh + 2.4, i / 44), e = max(abs(x) / Lh - 0.78, 0) * 4.2; keel.push([x, -dp(clamp(x, -Lh, Lh)) - 0.3 + e * e * e * 4.2, 0]); }
  m.sweep(keel, 0.55, 0.95, up);
  for (let x = -Lh + 0.7; x < Lh - 0.3; x += 0.8) {
    const a0 = rnd() < 0.1 ? rr(-0.9, -0.2) : -PI / 2, a1 = rnd() < 0.1 ? rr(0.2, 0.9) : PI / 2, pts = [];
    for (let i = 0; i <= 16; i++) pts.push(pt(x, mix(a0, a1, i / 16)));
    m.sweep(pts, 0.24, 0.3, out);
  }
  const holeX = rr(-6, 2), holeS = rnd() < 0.5 ? 1 : -1;
  const BR = [[holeX, holeS * 0.8, 3.2, 0.42], [7, -holeS * 0.95, 2.4, 0.34], [12, holeS * 0.5, 1.7, 0.28], [-11, -holeS * 0.55, 2.1, 0.3]];
  const holed = (x, ph) => { for (const h of BR) { const a = (x - h[0]) / h[2], b = (ph - h[1]) / h[3]; if (a * a + b * b < 1 + 0.45 * sin(x * 3.1 + ph * 9)) return true; } return false; };
  const NS = 14, xs = []; for (let x = -Lh + 0.35; x <= Lh - 0.3; x += 0.85) xs.push(x);
  for (let j = 0; j < NS; j++) {
    const p0 = mix(-1.5, 1.5, j / NS), p1 = mix(-1.5, 1.5, (j + 1) / NS), sg = p0 + p1 < 0 ? -1 : 1, lo = sg < 0 ? p1 : p0, hi = sg < 0 ? p0 : p1;
    let pv = null;
    for (const x of xs) {
      const cu = [m.v(...pt(x, lo, 0.27)), m.v(...pt(x, hi, 0.14)), m.v(...pt(x, lo, 0.1)), m.v(...pt(x, hi, 0.1))];
      if (pv && !holed(x - 0.42, (p0 + p1) / 2)) {
        if (sg > 0) { m.quad(pv[0], pv[1], cu[1], cu[0]); m.quad(pv[2], cu[2], cu[3], pv[3]); }
        else { m.quad(pv[0], cu[0], cu[1], pv[1]); m.quad(pv[2], pv[3], cu[3], cu[2]); }
      }
      pv = cu;
    }
  }
  for (const sgn of [-1, 1]) {
    let pts = []; for (let x = -Lh + 0.6; x <= Lh - 0.6; x += 1) pts.push(pt(x, sgn * PI / 2, 0.2)); m.sweep(pts, 0.3, 0.28, up);
    // stern castle bulwarks
    for (let j = 0; j < 3; j++) { pts = []; for (let x = -Lh + 0.4; x <= -Lh + 8.5 - j; x += 0.9) pts.push([x, sheer(x) + 0.55 + j * 0.86, sgn * (max(hb(x), 2.6) + 0.15)]); m.sweep(pts, 0.82, 0.09, () => [0, 0, sgn]); }
  }
  // transom
  for (let y = -3; y < sheer(-Lh) + 3; y += 0.86) { const w = max(1.2, 2.9 * sstep(-4.5, 1.5, y)); if (rnd() < 0.9) m.sweep([[-Lh + 0.35, y, -w], [-Lh + 0.35, y, w]], 0.82, 0.1, () => [1, 0, 0]); }
  for (let x = -Lh + 2; x < Lh - 2; x += rr(1.8, 3.2)) m.sweep([[x, sheer(x) - 0.25, -hb(x)], [x, sheer(x) - 0.2, 0], [x, sheer(x) - 0.25, hb(x)]], 0.26, 0.26, up);
  for (let z = -3.9; z <= 3.9; z += 0.62) { let x = -Lh + rr(1, 5); while (x < Lh - 4) { const x1 = min(x + rr(3, 9), Lh - 3.5); if (rnd() < 0.6) { const pts = []; for (let xx = x; xx <= x1; xx += 1) if (hb(xx) > abs(z) + 0.3) pts.push([xx, sheer(xx) - 0.05, z]); if (pts.length > 1) m.sweep(pts, 0.56, 0.07, up); } x = x1 + rr(0.5, 3); } }
  // foremast with yard, broken main mast, bowsprit
  m.sweep([[7, -Dp + 0.6, 0], [7.1, 1, 0], [7.4, 8, 0.3], [7.8, 15, 0.8]], (k) => 0.62 - k * 0.1, (k) => 0.62 - k * 0.1, () => [1, 0, 0]);
  m.sweep([[7.5, 9.5, -5.2], [7.5, 9.6, 0.3], [7.5, 9.2, 5.6]], 0.26, 0.26, up);
  m.sweep([[7.7, 13.2, -3.2], [7.7, 13.3, 3.6]], 0.2, 0.2, up);
  m.sweep([[-3, -Dp + 0.6, 0], [-3.2, 1, 0.2], [-3.9, 6, 1.0], [-5.2, 9.5, 2.6]], (k) => 0.74 - k * 0.1, (k) => 0.74 - k * 0.1, () => [1, 0, 0]);
  m.sweep([[Lh + 1.4, 2.6, 0], [Lh + 8, 5.2, 0.2]], 0.34, 0.34, up);
  return m;
}
// manta ray: span along x (half span = 1), nose +z; aux = span coordinate for the flap animation
function meshManta() {
  const m = new Mesh(), NU = 72, M = 22, rings = [];
  for (let j = 0; j <= NU; j++) {
    const u = j / NU * 2 - 1, au = abs(u);
    let zl = 0.52 - 0.74 * pow(au, 1.35) + 0.07 * exp(-pow((au - 0.13) / 0.05, 2)) - 0.05 * exp(-pow(au / 0.05, 2)) - 0.08 * pow(au, 5);
    const zt = -0.5 + 0.3 * pow(au, 0.8) + 0.02 - 0.08 * pow(au, 5);
    if (zl < zt + 0.004) zl = zt + 0.004;
    const th = 0.08 * pow(1 - au, 1.15) + 0.004 + 0.12 * exp(-pow(u / 0.2, 2)), ring = [];
    for (let k = 0; k < M; k++) { const a = k / M * TAU; ring.push(m.v(u, th * sin(a) * (0.62 + 0.38 * cos(a)), mix(zt, zl, 0.5 + 0.5 * cos(a)), u)); }
    rings.push(ring);
  }
  for (let j = 0; j < NU; j++) for (let k = 0; k < M; k++) { const k2 = (k + 1) % M; m.quad(rings[j][k], rings[j + 1][k], rings[j + 1][k2], rings[j][k2]); }
  const tail = []; for (let i = 0; i <= 8; i++) tail.push([0, 0, -0.42 - i * 0.19]);
  const n0 = m.p.length / 3;
  m.tube(tail, (k) => 0.016 * (1 - k / 9), 4, true);
  for (let k = n0; k < m.aux.length; k++) m.aux[k] = 0;
  for (const sx of [-1, 1]) { // cephalic fins
    const n1 = m.p.length / 3;
    m.tube([[sx * 0.12, -0.02, 0.48], [sx * 0.135, -0.05, 0.6], [sx * 0.115, -0.09, 0.69], [sx * 0.085, -0.125, 0.74]], (k) => 0.045 * (1 - k / 4.4), 6, true);
    for (let k = n1; k < m.aux.length; k++) m.aux[k] = sx * 0.1;
  }
  return m;
}
// shark (great white): length 2 along z (nose +z, tail -z), local y up. A dense, smooth body with a carved open mouth,
// gill slits and teeth, plus thin aerofoil-section fins. aux (normal.w) = how deep inside a mouth / gill slit a
// vertex is (0..1), -1 on teeth; the shader darkens and whitens by it
function meshShark() {
  const m = new Mesh(), M = 72;
  //             z      half-height  half-width
  const ST = [[1.0, 0.0, 0.0], [0.985, 0.022, 0.03], [0.95, 0.05, 0.06], [0.88, 0.085, 0.095], [0.78, 0.115, 0.125], [0.64, 0.15, 0.15], [0.45, 0.19, 0.18], [0.25, 0.215, 0.195], [0.05, 0.21, 0.18], [-0.2, 0.175, 0.15], [-0.45, 0.125, 0.105], [-0.68, 0.08, 0.068], [-0.85, 0.052, 0.05], [-0.95, 0.045, 0.052], [-0.99, 0.042, 0.045]];
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  const at = (z) => {
    let i = 0; while (i < ST.length - 2 && z < ST[i + 1][0]) i++;
    const t = clamp((ST[i][0] - z) / (ST[i][0] - ST[i + 1][0]), 0, 1), g = (k) => ST[clamp(k, 0, ST.length - 1)];
    return [1, 2].map((c) => max(0, cr(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], t)) * 1.08);
  };
  const mz = (x) => 0.72 - 3.3 * x * x; // the mouth line on the underside of the snout
  // carve the mouth (a groove at the lip line, the lower jaw dropped a little), and five gill slits, into a body point
  const carve = (x, y, z) => {
    let oy = 0, rd = 0, ax = 0; const w = abs(x);
    if (z > 0.4 && w < 0.17) {
      const dz = z - mz(x), k = sstep(0.15, 0.115, w) * sstep(0.04, -0.03, y);
      oy -= 0.011 * sstep(0.003, -0.012, dz) * (1 - sstep(-0.05, -0.17, dz)) * k;
      rd += 0.009 * exp(-pow(dz / 0.007, 2)) * k;
      ax = max(ax, exp(-pow((dz + 0.002) / 0.008, 2)) * k * 0.55);
    }
    if (w > 0.07 && z > 0.2 && z < 0.54) for (let g = 0; g < 5; g++) {
      const dz = z - (0.5 - 0.042 * g - 0.15 * y), k = sstep(0.07, 0.1, w) * sstep(0.15, 0.1, y) * sstep(-0.13, -0.09, y);
      rd += 0.008 * exp(-pow(dz / 0.009, 2)) * k; ax = max(ax, exp(-pow(dz / 0.011, 2)) * k * 0.45);
    }
    const l = hypot(x, y) || 1;
    return [x - x / l * rd, y + oy - y / l * rd, z, ax];
  };
  const zs = []; for (let z = 0.995; z > 0.15; z -= 0.007) zs.push(z); for (let z = 0.15; z > -0.985; z -= 0.016) zs.push(z); zs.push(-0.99);
  const surf = (a, z) => { const [h, wd] = at(z), sy = sin(a), cx = cos(a); return carve(wd * cx * (1 - 0.14 * sy), (sy > 0 ? h * sy : h * 0.88 * sy) - 0.02 * sstep(0.5, 1, z), z); };
  const NS = zs.length, rings = [];
  for (let j = 0; j < NS; j++) { const r = []; for (let k = 0; k < M; k++) { const p = surf(k / M * TAU, zs[j]); r.push(m.v(p[0], p[1], p[2], p[3])); } rings.push(r); }
  const nose = m.v(0, -0.004, 1.0, 0);
  for (let k = 0; k < M; k++) m.tri(rings[0][(k + 1) % M], rings[0][k], nose);
  for (let j = 0; j < NS - 1; j++) for (let k = 0; k < M; k++) { const k2 = (k + 1) % M; m.quad(rings[j][k], rings[j + 1][k], rings[j + 1][k2], rings[j][k2]); }
  const last = rings[NS - 1], c0 = m.v(0, 0, -0.99, 0); for (let k = 0; k < M; k++) m.tri(last[(k + 1) % M], last[k], c0);
  // teeth: small serrated-looking cones along both lips
  const NT = 45;
  for (let i = 0; i < NT; i++) {
    const u = i / (NT - 1) * 2 - 1, x = u * 0.112, len = 0.013 - 0.006 * u * u, hw = 0.0042;
    for (const up of [1, 0]) {
      const z = mz(x) + (up ? 0.0015 : -0.006), [h, wd] = at(z), cx = clamp(x / (wd * 1.14), -1, 1), sy = -sqrt(1 - cx * cx);
      const b = carve(x, h * 0.88 * sy - 0.02 * sstep(0.5, 1, z), z), dx = 8 * x * hw * 0.5, tl = hypot(1, dx) ;
      const A = m.v(b[0] - hw / tl, b[1], b[2] + dx * hw / tl, -1), B = m.v(b[0] + hw / tl, b[1], b[2] - dx * hw / tl, -1);
      const C = m.v(b[0], b[1], b[2] + 0.5 * hw * 1.2, -1), D = m.v(b[0] + x * 0.1, b[1] + (up ? -len : len * 0.85), b[2] + (up ? 0.003 : 0.006), -1);
      if (up) { m.tri(A, B, D); m.tri(B, C, D); m.tri(C, A, D); } else { m.tri(B, A, D); m.tri(C, B, D); m.tri(A, C, D); }
    }
  }
  // aerofoil-section fin: leading edge F(s) and trailing edge R(s) from root (s=0) to tip (s=1), thick along nrm
  const wing = (F, R, nrm, th, NSp = 16, NC = 10) => {
    const up = [];
    for (let i = 0; i <= NSp; i++) {
      const s = i / NSp, f = F(s), r = R(s), row = [];
      for (let j = 0; j <= NC; j++) { const c = j / NC, cc = c * c * (3 - 2 * c) * 0.35 + c * 0.65, t = th * (sqrt(cc) * (1 - cc) / 0.385) * (1 - s * 0.88); row.push([mix(f[0], r[0], cc), mix(f[1], r[1], cc), mix(f[2], r[2], cc), t]); }
      up.push(row);
    }
    const id = [[], []];
    for (let g = 0; g < 2; g++) for (let i = 0; i <= NSp; i++) {
      id[g].push(up[i].map((q, j) => (g && (j === 0 || j === NC || i === NSp)) ? id[0][i][j] : m.v(q[0] + nrm[0] * q[3] * (g ? -1 : 1), q[1] + nrm[1] * q[3] * (g ? -1 : 1), q[2] + nrm[2] * q[3] * (g ? -1 : 1), 0)));
    }
    const tri3 = (a, b, c, d) => {
      const P = m.p, ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      return (uy * vz - uz * vy) * d[0] + (uz * vx - ux * vz) * d[1] + (ux * vy - uy * vx) * d[2] >= 0;
    };
    for (let g = 0; g < 2; g++) for (let i = 0; i < NSp; i++) for (let j = 0; j < NC; j++) {
      const a = id[g][i][j], b = id[g][i + 1][j], c = id[g][i + 1][j + 1], d = id[g][i][j + 1], dir = g ? [-nrm[0], -nrm[1], -nrm[2]] : nrm;
      for (const [p, q, r] of [[a, b, c], [a, c, d]]) if (p !== q && q !== r && p !== r) { if (tri3(p, q, r, dir)) m.tri(p, q, r); else m.tri(p, r, q); }
    }
  };
  const X = [1, 0, 0], Y = [0, 1, 0];
  wing((s) => [0, 0.17 + 0.46 * s, 0.30 - 0.50 * pow(s, 1.1)], (s) => [0, 0.16 + 0.45 * s, -0.12 - 0.08 * pow(s, 2.5)], X, 0.022, 20, 12);        // first dorsal
  wing((s) => [0, 0.1 + 0.12 * s, -0.55 - 0.15 * s], (s) => [0, 0.095 + 0.11 * s, -0.7 - 0.05 * s], X, 0.008, 8, 8);                           // second dorsal
  wing((s) => [0, -0.1 - 0.12 * s, -0.54 - 0.14 * s], (s) => [0, -0.095 - 0.11 * s, -0.69 - 0.04 * s], X, 0.008, 8, 8);                        // anal
  wing((s) => [0, 0.045 + 0.42 * s, -0.93 - 0.42 * pow(s, 1.1)], (s) => [0, 0.04 + 0.41 * s, -1.2 - 0.2 * pow(s, 1.6)], X, 0.018, 20, 12);    // tail, upper lobe
  wing((s) => [0, 0.045 - 0.3 * s, -0.93 - 0.22 * s], (s) => [0, 0.03 - 0.3 * s, -1.15 - 0.05 * pow(s, 1.7)], X, 0.014, 14, 12);               // tail, lower lobe
  for (const sg of [-1, 1]) {
    wing((s) => [sg * (0.16 + 0.5 * s), -0.14 - 0.28 * s, 0.34 - 0.5 * pow(s, 1.2)], (s) => [sg * (0.17 + 0.53 * s), -0.12 - 0.31 * s, 0.04 - 0.22 * s * s], Y, 0.016, 20, 12); // pectorals
    wing((s) => [sg * (0.07 + 0.17 * s), -0.15 - 0.07 * s, -0.3 - 0.1 * s], (s) => [sg * (0.075 + 0.17 * s), -0.14 - 0.07 * s, -0.46 - 0.04 * s], Y, 0.008, 8, 8);  // pelvics
  }
  return m;
}
// nurse shark (tawny, Indo-Pacific): length ~2.7 along z (nose +z, tail -z), y up. Flat belly, broad flat head with barbels, two
// equal dorsal fins far back, rounded paddle fins, long low tail. Same scheme as meshShark: aux = how deep in a groove (mouth,
// gill slits, spiracles), 0..1
// nurse shark body profile (z, half-height, half-width), shared by the mesh and by the placement that lays each shark on the ground
const NURSE_ST = [[1.0, 0.0, 0.0], [0.9985, 0.006, 0.034], [0.992, 0.015, 0.068], [0.978, 0.027, 0.098], [0.957, 0.04, 0.121], [0.93, 0.048, 0.138], [0.9, 0.056, 0.155], [0.85, 0.07, 0.177], [0.8, 0.082, 0.197], [0.72, 0.097, 0.218], [0.65, 0.108, 0.232], [0.45, 0.122, 0.205], [0.2, 0.125, 0.175], [-0.1, 0.118, 0.15], [-0.4, 0.1, 0.122], [-0.7, 0.078, 0.092], [-1.0, 0.058, 0.064], [-1.3, 0.046, 0.048], [-1.55, 0.04, 0.042]];
const nurseCR = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
const nurseAt = (z) => {
  const ST = NURSE_ST; let i = 0; while (i < ST.length - 2 && z < ST[i + 1][0]) i++;
  const t = clamp((ST[i][0] - z) / (ST[i][0] - ST[i + 1][0]), 0, 1), g = (k) => ST[clamp(k, 0, ST.length - 1)];
  return [1, 2].map((c) => max(0, nurseCR(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], t)) * 1.08);
};
// the snout is stretched: everything of the head ahead of z = 0.65 is drawn 1.5 times as far forward (nose at z = 1.175)
const NOSE = 1.175, nurseZ = (z) => (z > 0.65 ? 0.65 + (z - 0.65) * 1.5 : z), nurseZ0 = (z) => (z > 0.65 ? 0.65 + (z - 0.65) / 1.5 : z);
// stations along the body where each sleeping shark stores how far the ground is from its straight rest pose
const NURSE_ZK = [1.12, 0.75, 0.3, -0.15, -0.6, -1.1, -1.6, -2.2];
const nurseOffAt = (a, o, z) => { // world-space vertical offset at body z for the instance starting at a[o] (16 floats)
  if (z >= NURSE_ZK[0]) return a[o + 8]; if (z <= NURSE_ZK[7]) return a[o + 15];
  let k = 0; while (z < NURSE_ZK[k + 1]) k++;
  const t = (NURSE_ZK[k] - z) / (NURSE_ZK[k] - NURSE_ZK[k + 1]), s = t * t * (3 - 2 * t);
  return a[o + 8 + k] * (1 - s) + a[o + 9 + k] * s;
};
function meshNurse() {
  const m = new Mesh(), M = 56;
  const at = nurseAt;
  const mz = (x) => 0.93 - 1.5 * x * x; // the small mouth, on the underside of the front of the head
  // the eyes: small round eyeballs on the sides of the head, a little forward of the spiracles, under a slight brow ridge
  const EYE = [-1, 1].map((s) => { let best = null; for (let k = 0; k < 720; k++) { const an = k / 720 * TAU, [h, wd] = at(0.86), sy = sin(an), cx = cos(an), lower = sy < 0, ys = lower ? -h * 0.52 * pow(-sy, 0.75) : h * sy, xs = wd * cx * (lower ? 1 + 0.1 * (-sy) : 1 - 0.1 * sy); if (ys > 0.02 && ys < 0.075) { const d = abs(s * xs - 0.145); if (!best || d < best[0]) best = [d, xs, ys]; } } return [best[1], best[2], 0.86]; });
  const carve = (x, y, z) => {
    let rd = 0, ax = 0; const w = abs(x);
    if (z > 0.8 && w < 0.09) { const dz = z - mz(x), k = sstep(0.09, 0.06, w) * sstep(0.0, -0.05, y); rd += 0.007 * exp(-pow(dz / 0.008, 2)) * k; ax = max(ax, exp(-pow(dz / 0.011, 2)) * k * 0.7); }
    if (w > 0.1 && z > 0.42 && z < 0.64) for (let g = 0; g < 5; g++) { // five gill slits
      const dz = z - (0.6 - 0.036 * g - 0.1 * y), k = sstep(0.1, 0.13, w) * sstep(0.08, 0.03, y) * sstep(-0.06, -0.02, y);
      rd += 0.007 * exp(-pow(dz / 0.008, 2)) * k; ax = max(ax, exp(-pow(dz / 0.01, 2)) * k * 0.55);
    }
    for (const e of EYE) { // the brow: a raised arch over the top (inboard side) of each eye, running from in front of it to behind it
      const dx = x - e[0], dz = z - e[2], d = hypot(dx, dz), inb = -(e[0] < 0 ? -1 : 1) * dx; // inb > 0 towards the middle of the head
      if (d < 0.05 && y > 0.0) { const arch = exp(-pow((d - 0.024) / 0.008, 2)) * sstep(-0.01, 0.012, inb); rd -= 0.017 * arch; ax = max(ax, 0); }
      if (d < 0.04 && y > 0.0) rd += 0.0025 * exp(-pow((d - 0.017) / 0.005, 2)) * sstep(0.004, -0.014, inb); // a faint lid crease below
    }
    for (const s of [-1, 1]) { // spiracles: small slits just behind the eyes
      const dx = x - s * 0.105, dz = z - 0.745, k = exp(-(dx * dx + dz * dz * 0.25) / 0.00018) * sstep(0.05, 0.09, y);
      rd += 0.006 * k; ax = max(ax, k * 0.8);
    }
    const l = hypot(x, y) || 1;
    return [x - x / l * rd, y - y / l * rd, z, ax];
  };
  // dense rings along the head, coarser behind
  const zs = []; for (let z = 0.9985; z > 0.93; z -= 0.0035) zs.push(z); for (let z = 0.93; z > 0.4; z -= 0.007) zs.push(z); for (let z = 0.4; z > -1.545; z -= 0.016) zs.push(z); zs.push(-1.55);
  const base = (a, z) => {
    const [h, wd] = at(z), sy = sin(a), cx = cos(a);
    // flat belly: the lower half is squashed and squared off
    const lower = sy < 0, ys = lower ? -h * 0.52 * pow(-sy, 0.75) : h * sy, xs = wd * cx * (lower ? 1 + 0.1 * (-sy) : 1 - 0.1 * sy);
    return [xs, ys];
  };
  const surf = (a, z) => { const b = base(a, z); return carve(b[0], b[1], z); };
  const NS = zs.length, rings = [];
  for (let j = 0; j < NS; j++) { const r = []; for (let k = 0; k < M; k++) { const p = surf(k / M * TAU, zs[j]); r.push(m.v(p[0], p[1], nurseZ(p[2]), p[3])); } rings.push(r); }
  const nose = m.v(0, -0.006, NOSE, 0);
  for (let k = 0; k < M; k++) m.tri(rings[0][(k + 1) % M], rings[0][k], nose);
  for (let j = 0; j < NS - 1; j++) for (let k = 0; k < M; k++) { const k2 = (k + 1) % M; m.quad(rings[j][k], rings[j + 1][k], rings[j + 1][k2], rings[j][k2]); }
  const last = rings[NS - 1], c0 = m.v(0, 0, -1.55, 0); for (let k = 0; k < M; k++) m.tri(last[(k + 1) % M], last[k], c0);
  for (const e of EYE) { // eyeballs
    const R = 0.0115, lx = e[0], ly = e[1], lz = nurseZ(e[2]), ol = hypot(lx, ly) || 1, cxe = lx - lx / ol * 0.003, cye = ly - ly / ol * 0.003, ids = [];
    for (let la = 0; la <= 8; la++) { const row = []; for (let lo = 0; lo < 14; lo++) { const th = la / 8 * Math.PI, ph = lo / 14 * TAU; row.push(m.v(cxe + R * sin(th) * cos(ph), cye + R * cos(th), lz + R * sin(th) * sin(ph), -1)); } ids.push(row); }
    for (let la = 0; la < 8; la++) for (let lo = 0; lo < 14; lo++) { const l2 = (lo + 1) % 14; m.quad(ids[la][lo], ids[la + 1][lo], ids[la + 1][l2], ids[la][l2]); }
  }
  // two barbels at the nostrils, in front of the mouth
  for (const s of [-1, 1]) m.tube([[s * 0.042, -0.02, nurseZ(0.955)], [s * 0.046, -0.055, nurseZ(0.975)], [s * 0.05, -0.085, nurseZ(0.985)]], (k) => 0.011 * (1 - k * 0.18), 7, true, () => 0);
  // aerofoil-section fin: leading edge F(s) and trailing edge R(s), root (s = 0) to tip (s = 1), thick along nrm
  const wing = (F, R, nrm, th, NSp = 14, NC = 9) => {
    const up = [];
    for (let i = 0; i <= NSp; i++) {
      const s = i / NSp, f = F(s), r = R(s), row = [];
      for (let j = 0; j <= NC; j++) { const c = j / NC, cc = c * c * (3 - 2 * c) * 0.35 + c * 0.65, t = th * (sqrt(cc) * (1 - cc) / 0.385) * (1 - s * 0.85); row.push([mix(f[0], r[0], cc), mix(f[1], r[1], cc), mix(f[2], r[2], cc), t]); }
      up.push(row);
    }
    const id = [[], []];
    for (let g = 0; g < 2; g++) for (let i = 0; i <= NSp; i++) {
      id[g].push(up[i].map((q, j) => (g && (j === 0 || j === NC || i === NSp)) ? id[0][i][j] : m.v(q[0] + nrm[0] * q[3] * (g ? -1 : 1), q[1] + nrm[1] * q[3] * (g ? -1 : 1), q[2] + nrm[2] * q[3] * (g ? -1 : 1), 0)));
    }
    const tri3 = (a, b, c, d) => {
      const P = m.p, ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      return (uy * vz - uz * vy) * d[0] + (uz * vx - ux * vz) * d[1] + (ux * vy - uy * vx) * d[2] >= 0;
    };
    for (let g = 0; g < 2; g++) for (let i = 0; i < NSp; i++) for (let j = 0; j < NC; j++) {
      const a = id[g][i][j], b = id[g][i + 1][j], c = id[g][i + 1][j + 1], d = id[g][i][j + 1], dir = g ? [-nrm[0], -nrm[1], -nrm[2]] : nrm;
      for (const [p, q, r] of [[a, b, c], [a, c, d]]) if (p !== q && q !== r && p !== r) { if (tri3(p, q, r, dir)) m.tri(p, q, r); else m.tri(p, r, q); }
    }
  };
  const X = [1, 0, 0], Y = [0, 1, 0];
  // fins are pointed and swept back, like the real animal's: chord(s) tapers to a point, the centre line runs back, the
  // leading edge bulges forward and the trailing edge is a little concave. Every root starts well inside the body.
  const tap = (s, full, tip, pw = 0.9) => tip + full * pow(max(1 - s, 0), pw);
  const lead = (s, a) => a * sin(Math.PI * s);
  wing((s) => [0, 0.075 + 0.39 * s, -0.05 - 0.5 * s + tap(s, 0.4, 0.02) / 2 + lead(s, 0.035)], (s) => [0, 0.07 + 0.385 * s, -0.05 - 0.5 * s - tap(s, 0.4, 0.02) / 2 + lead(s, 0.07)], X, 0.021, 20, 10);          // first dorsal
  wing((s) => [0, 0.03 + 0.24 * s, -0.84 - 0.24 * s + tap(s, 0.3, 0.02) / 2 + lead(s, 0.025)], (s) => [0, 0.025 + 0.235 * s, -0.84 - 0.24 * s - tap(s, 0.3, 0.02) / 2 + lead(s, 0.05)], X, 0.017, 16, 9);           // second dorsal
  wing((s) => [0, -0.01 - 0.15 * s, -1.0 - 0.12 * s + tap(s, 0.17, 0.015) / 2], (s) => [0, -0.015 - 0.15 * s, -1.0 - 0.12 * s - tap(s, 0.17, 0.015) / 2 + lead(s, 0.02)], X, 0.012, 10, 8);                    // anal
  wing((s) => [0, -0.01 + 0.2 * s, -1.4 - 0.9 * s + tap(s, 0.3, 0.015) / 2 + lead(s, 0.02)], (s) => [0, -0.015 + 0.195 * s, -1.4 - 0.9 * s - tap(s, 0.3, 0.015) / 2 + lead(s, 0.04)], X, 0.02, 26, 10);              // tail, upper lobe
  wing((s) => [0, -0.01 - 0.11 * s, -1.4 - 0.4 * s + tap(s, 0.2, 0.015) / 2], (s) => [0, -0.015 - 0.11 * s, -1.4 - 0.4 * s - tap(s, 0.2, 0.015) / 2], X, 0.014, 12, 8);                                   // tail, lower lobe
  for (const sg of [-1, 1]) {
    wing((s) => [sg * (0.05 + 0.74 * s), -0.045 - 0.075 * s, 0.5 - 0.5 * s + tap(s, 0.34, 0.03) / 2 + lead(s, 0.05)], (s) => [sg * (0.06 + 0.74 * s), -0.04 - 0.075 * s, 0.5 - 0.5 * s - tap(s, 0.34, 0.03) / 2 + lead(s, 0.09)], Y, 0.017, 20, 10);   // pectorals
    wing((s) => [sg * (0.03 + 0.4 * s), -0.04 - 0.045 * s, -0.4 - 0.2 * s + tap(s, 0.2, 0.02) / 2 + lead(s, 0.025)], (s) => [sg * (0.04 + 0.4 * s), -0.035 - 0.045 * s, -0.4 - 0.2 * s - tap(s, 0.2, 0.02) / 2 + lead(s, 0.04)], Y, 0.013, 14, 8); // pelvics
  }
  return m;
}
// --- things that live on the sea floor and reef (each roughly one metre or less across at scale 1)
function meshUrchin() {
  const m = icosphere(2, (x, y, z) => [x * 0.085, y * 0.07, z * 0.085]), ico = icosphere(1);
  for (let k = 0; k < ico.p.length; k += 3) { const x = ico.p[k], y = ico.p[k + 1], z = ico.p[k + 2]; if (y < -0.35) continue; m.tube([[x * 0.07, y * 0.06, z * 0.07], [x * 0.15, y * 0.13, z * 0.15], [x * 0.26, y * 0.22, z * 0.26]], (q) => [0.011, 0.007, 0.002][q], 4, true); }
  return m;
}
function meshStarfish() {
  const m = new Mesh(), NA = 40, NR = 7, rings = [];
  for (let j = 0; j <= NR; j++) {
    const r = j / NR, ring = [];
    for (let k = 0; k < NA; k++) { const a = k / NA * TAU, R = 0.32 + 0.68 * pow(abs(cos(2.5 * a)), 1.5), rr_ = r * R * 0.16; ring.push(m.v(cos(a) * rr_, 0.012 + 0.03 * pow(1 - r, 1.2) * (0.6 + 0.4 * R), sin(a) * rr_)); }
    rings.push(ring);
  }
  const bot = []; for (let k = 0; k < NA; k++) { const a = k / NA * TAU, R = 0.32 + 0.68 * pow(abs(cos(2.5 * a)), 1.5); bot.push(m.v(cos(a) * R * 0.16, 0.002, sin(a) * R * 0.16)); } rings.push(bot);
  for (let j = 0; j <= NR; j++) for (let k = 0; k < NA; k++) { const k2 = (k + 1) % NA; m.quad(rings[j][k], rings[j + 1][k], rings[j + 1][k2], rings[j][k2]); }
  const c = m.v(0, 0.002, 0); for (let k = 0; k < NA; k++) m.tri(bot[k], bot[(k + 1) % NA], c);
  return m;
}
function meshShell() { // a scallop: a ribbed fan
  const m = new Mesh(), NA = 28, NR = 6, rows = [];
  for (let j = 0; j <= NR; j++) { const r = j / NR, row = []; for (let k = 0; k <= NA; k++) { const a = (k / NA * 2 - 1) * 1.15; row.push(m.v(sin(a) * r * 0.11, 0.004 + r * 0.045 * (1 + 0.12 * cos(a * 12)) * (1 - 0.3 * r), cos(a) * r * 0.11)); } rows.push(row); }
  for (let j = 0; j < NR; j++) for (let k = 0; k < NA; k++) m.quad(rows[j][k], rows[j + 1][k], rows[j + 1][k + 1], rows[j][k + 1]);
  return m;
}
function meshCucumber() {
  const m = new Mesh(), P = []; for (let k = 0; k < 9; k++) P.push([k * 0.04 - 0.16, 0.04 + 0.01 * sin(k * 0.8), 0.02 * sin(k * 0.6)]);
  m.tube(P, (k) => (0.036 + 0.014 * sin(k * 2.3)) * (k === 0 || k === 8 ? 0.6 : 1), 8, true);
  return m;
}
function meshEel() { // a garden eel: a thin standing tube; aux = height (the sway grows with it)
  const m = new Mesh();
  m.tube([[0, 0, 0], [0, 0.2, 0], [0, 0.45, 0], [0, 0.7, 0], [0, 0.9, 0], [0, 1.0, 0]], (k) => [0.02, 0.02, 0.018, 0.018, 0.02, 0.026][k], 7, true, (k) => k / 5);
  return m;
}
function meshTable() { // table coral: a stalk and a wavy plate
  const m = new Mesh(); m.tube([[0, 0, 0], [0, 0.18, 0], [0, 0.36, 0]], (k) => [0.09, 0.065, 0.06][k], 7, false);
  const NA = 48, NR = 8, top = [], under = [];
  for (let j = 0; j <= NR; j++) { const r = j / NR, a1 = [], a2 = []; for (let k = 0; k < NA; k++) { const a = k / NA * TAU, R = 0.75 * (1 + 0.12 * sin(7 * a) + 0.06 * sin(13 * a + 1)) * r, y = 0.38 - 0.12 * r * r + 0.02 * r * sin(a * 5); a1.push(m.v(cos(a) * R, y + 0.012, sin(a) * R)); a2.push(m.v(cos(a) * R, y - 0.022, sin(a) * R)); } top.push(a1); under.push(a2); }
  for (let j = 0; j < NR; j++) for (let k = 0; k < NA; k++) { const k2 = (k + 1) % NA; m.quad(top[j][k], top[j + 1][k], top[j + 1][k2], top[j][k2]); m.quad(under[j][k], under[j][k2], under[j + 1][k2], under[j + 1][k]); }
  for (let k = 0; k < NA; k++) { const k2 = (k + 1) % NA; m.quad(top[NR][k], top[NR][k2], under[NR][k2], under[NR][k]); }
  return m;
}
function meshBrain() { return icosphere(3, (x, y, z) => { const yy = max(y, -0.15), lump = 1 + 0.08 * sin(x * 9) * sin(z * 9); return [x * 0.34 * lump, yy * 0.26 * lump, z * 0.34 * lump]; }); }
function meshAnemone() { // a column of soft tentacles; aux = how far along the tentacle (the sway)
  const m = new Mesh();
  m.tube([[0, 0, 0], [0, 0.06, 0], [0, 0.12, 0]], (k) => [0.07, 0.065, 0.05][k], 8, false);
  for (let k = 0; k < 56; k++) { const a = k * 2.4, rr_ = 0.012 * sqrt(k + 1) * 1.1, bx = cos(a) * rr_, bz = sin(a) * rr_; m.tube([[bx, 0.1, bz], [bx * 1.5, 0.19, bz * 1.5], [bx * 2.1, 0.27, bz * 2.1]], (q) => [0.013, 0.009, 0.004][q], 4, true, (q) => q / 2); }
  return m;
}
function meshFish() {
  const m = new Mesh();
  const X = [0.5, 0.3, 0.05, -0.22, -0.34], H = [0.01, 0.13, 0.17, 0.09, 0.035], Wd = [0.01, 0.05, 0.065, 0.03, 0.012], rings = [];
  for (let i = 0; i < 5; i++) { const r = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; r.push(m.v(X[i], sin(a) * H[i], cos(a) * Wd[i])); } rings.push(r); }
  for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; m.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]); }
  const a = m.v(-0.33, 0, 0), b = m.v(-0.56, 0.2, 0), c = m.v(-0.47, 0, 0), d = m.v(-0.56, -0.2, 0);
  m.tri(a, b, c); m.tri(a, c, d);
  return m;
}
