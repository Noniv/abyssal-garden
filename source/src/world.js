// ============================================================================
// world layout + procedural content generation (load-time only)
// ============================================================================

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
  const sn = surfaceNets(D, NX, NY, NZ), nv = sn.nv, nq = sn.ni / 6, I = sn.idx;
  const smp = sampler3(D, NX, NY, NZ);
  // On High every quad becomes four: capacity for the edge and face points (a closed quad mesh has about 2 edges a quad)
  const fine = LV < 1, cap = fine ? nv + nq * 3 + 4096 : nv;
  let gp = sn.pos, gn = new Float32Array(cap * 3), nf = nv;
  if (fine) { gp = new Float32Array(cap * 3); gp.set(sn.pos); }
  // normal = downhill direction of the density, at grid position k
  const normalAt = (k) => {
    const x = gp[k * 3], y = gp[k * 3 + 1], z = gp[k * 3 + 2], e = 0.8;
    let nx = smp(x - e, y, z) - smp(x + e, y, z), ny = smp(x, y - e, z) - smp(x, y + e, z), nz = smp(x, y, z - e) - smp(x, y, z + e);
    const l = hypot(nx, ny, nz) || 1; gn[k * 3] = nx / l; gn[k * 3 + 1] = ny / l; gn[k * 3 + 2] = nz / l;
  };
  for (let k = 0; k < nv; k++) normalAt(k);
  // erosion on High: three scales of noise pushed along the normal, the broadest (up to a quarter metre) to break up
  // long straight edges
  const erode = (X, Y, Z) => fine ? (fbm(X * 0.42, Y * 0.42, Z * 0.42, 3) - 0.5) * 0.9 + (fbm(X * 1.1, Y * 1.1, Z * 1.1, 3) - 0.5) * 0.24 + (vnoise(X * 4.3, Y * 4.3, Z * 4.3) - 0.5) * 0.07 : 0;
  // the generator places things on the coarse vertices (world space)
  const wp = new Float32Array(nv * 3), wn = gn.slice(0, nv * 3);
  for (let k = 0; k < nv; k++) {
    const X = OX + gp[k * 3] * VS, Y = OY + gp[k * 3 + 1] * VS, Z = OZ + gp[k * 3 + 2] * VS, e = erode(X, Y, Z);
    wp[k * 3] = X + gn[k * 3] * e; wp[k * 3 + 1] = Y + gn[k * 3 + 1] * e; wp[k * 3 + 2] = Z + gn[k * 3 + 2] * e;
  }
  // bucket quads into the XZ culling grid
  const key = new Uint8Array(nq), cnt = new Uint32Array(CELLS * CELLS + 1);
  const lo = new Float32Array(CELLS * CELLS).fill(1e9), hi = new Float32Array(CELLS * CELLS).fill(-1e9);
  for (let q = 0; q < nq; q++) {
    const a = I[q * 6] * 3;
    const c = clamp(floor((wp[a] - OX) / CELLW), 0, CELLS - 1) + CELLS * clamp(floor((wp[a + 2] - OZ) / CELLW), 0, CELLS - 1);
    key[q] = c; cnt[c + 1]++;
    for (let j = 0; j < 6; j++) { const y = wp[I[q * 6 + j] * 3 + 1]; if (y < lo[c]) lo[c] = y; if (y > hi[c]) hi[c] = y; }
  }
  for (let c = 0; c < CELLS * CELLS; c++) cnt[c + 1] += cnt[c];
  // fine indices first; on High the coarse quads follow them, in the same cell order, for the distant seabed
  const per = fine ? 24 : 6, ib = new Uint32Array(nq * (fine ? 30 : 6)), fill = cnt.slice();
  if (!fine) for (let q = 0; q < nq; q++) { const o = fill[key[q]]++ * 6; for (let j = 0; j < 6; j++) ib[o + j] = I[q * 6 + j]; }
  else {
    // edge midpoints are shared between neighbouring quads: an open-addressing table from the vertex pair to the new vertex
    let bits = 16; while ((1 << bits) < nq * 5) bits++;
    const mask = (1 << bits) - 1, hk = new Float64Array(1 << bits).fill(-1), hv = new Uint32Array(1 << bits);
    const mid = (a, b) => {
      const l = a < b ? a : b, h = a < b ? b : a, k = l * 4194304 + h;
      let i = (Math.imul(l, 0x9E3779B1) ^ Math.imul(h, 0x85EBCA6B)) & mask;
      while (hk[i] >= 0) { if (hk[i] === k) return hv[i]; i = (i + 1) & mask; }
      // the edge as a curve that leaves each end in that end's tangent plane; its middle point
      const A = a * 3, B = b * 3, dx = gp[B] - gp[A], dy = gp[B + 1] - gp[A + 1], dz = gp[B + 2] - gp[A + 2];
      const da = (dx * gn[A] + dy * gn[A + 1] + dz * gn[A + 2]) / 8, db = (dx * gn[B] + dy * gn[B + 1] + dz * gn[B + 2]) / 8, n = nf++, N = n * 3;
      gp[N] = (gp[A] + gp[B]) / 2 + db * gn[B] - da * gn[A]; gp[N + 1] = (gp[A + 1] + gp[B + 1]) / 2 + db * gn[B + 1] - da * gn[A + 1]; gp[N + 2] = (gp[A + 2] + gp[B + 2]) / 2 + db * gn[B + 2] - da * gn[A + 2];
      hk[i] = k; hv[i] = n; return n;
    };
    const put = (o, a, b, c, d) => { ib[o] = a; ib[o + 1] = b; ib[o + 2] = c; ib[o + 3] = a; ib[o + 4] = c; ib[o + 5] = d; };
    for (let q = 0; q < nq; q++) {
      // the quad's corners in winding order: its two triangles are (a, b, c)(a, c, d) or (a, c, b)(a, d, c)
      const i = q * 6, f = I[i + 2] === I[i + 4], v0 = I[i], v1 = f ? I[i + 1] : I[i + 4], v2 = f ? I[i + 2] : I[i + 1], v3 = f ? I[i + 5] : I[i + 2];
      const e0 = mid(v0, v1), e1 = mid(v1, v2), e2 = mid(v2, v3), e3 = mid(v3, v0), c = nf++, C = c * 3;
      for (let j = 0; j < 3; j++) gp[C + j] = (gp[e0 * 3 + j] + gp[e1 * 3 + j] + gp[e2 * 3 + j] + gp[e3 * 3 + j]) / 4;
      const o = fill[key[q]]++ * 24;
      for (let j = 0; j < 6; j++) ib[nq * 24 + o / 4 + j] = I[i + j];
      put(o, v0, e0, c, e3); put(o + 6, e0, v1, e1, c); put(o + 12, c, e1, v2, e2); put(o + 18, e3, c, e2, v3);
    }
    for (let k = nv; k < nf; k++) normalAt(k);
    for (let c = 0; c <= CELLS * CELLS; c++) cnt[c] *= 4;
  }
  const vb = new ArrayBuffer(nf * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  for (let k = 0; k < nf; k++) {
    const nx = gn[k * 3], ny = gn[k * 3 + 1], nz = gn[k * 3 + 2];
    let X = OX + gp[k * 3] * VS, Y = OY + gp[k * 3 + 1] * VS, Z = OZ + gp[k * 3 + 2] * VS;
    if (fine) { const e = erode(X, Y, Z); X += nx * e; Y += ny * e; Z += nz * e; }
    vf[k * 4] = X; vf[k * 4 + 1] = Y; vf[k * 4 + 2] = Z;
    v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = 127;
  }
  return { vb, ib, nv, wp, wn, smp, start: cnt, lo, hi, fine, nFine: nq * per };
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
  const leaf = (L, x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend) => { if (type === 1 || !(nth++ % THIN)) L[cellOf(x, z)].push(x, y, z, len, yaw, tilt, type === 1 ? wid : wid * (1 + LV / 2), hA, type, s1, s2, bend); };
  const glint = (...a) => { nth++ % THIN || glints.push(...a); };
  const solids = []; // per mesh id: arrays of 12 floats
  const props = PROPM.map(() => Array.from({ length: nCells }, () => []));
  const solid = (mesh, x, y, z, sc, q, mat, seed, ts = 1, bob = 0) => { const pi = PROPM.indexOf(mesh); (pi >= 0 ? props[pi][cellOf(x, z)] : (solids[mesh] ||= [])).push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, seed, ts, bob); };
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
  const nearFly = (x, y, z, r) => { for (const p of flyPts) if (hypot(x - p[0], z - p[2]) < r && y < p[1] + 3 && y > p[1] - 13) return true; return false; };
  const nearPose = (x, z, r = 3) => { for (const p of POSES) if (hypot(x - p[0], z - p[2]) < r) return true; return false; };
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
    if (rnd() > magAt(x, z) + 0.12 || nearPose(x, z)) continue;
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
  const GARD = [[-68, -6, 9, 260], [-66, 6, 7, 160], [16, 72, 7, 200], [-6, 74, 6, 120], [-13, -2, 6, 80], [8, -88, 8, 160], [44, 12, 7, 120], [-62, 22, 6, 140], [-47, 40, 6, 140], [-30, 47, 6, 120], [-12, 48, 5, 100], [14, 28, 6, 140], [28, 45, 6, 120], [-36, -76, 6, 130], [-49, -58, 6, 130], [-58, -38, 6, 120]];
  for (const g of GARD) {
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
  // --- rocks: floating boulder clusters + scattered ground rocks
  const BOULD = [[-11, -11, -105, 14, 5], [-56, -19, -18, 18, 6], [10, -13, -88, 22, 7], [24, -15, -24, 22, 7], [-18, -12, 4, 14, 6], [30, -14, 30, 16, 6], [36, -12, -70, 22, 8], [-30, -13, -84, 16, 7], [-58, -14, 0, 14, 6], [19, -13, 98, 18, 6], [62, -9, 34, 14, 6]];
  rseed(8);
  for (let i = 0; i < 9; i++) { const a = rnd() * TAU, r = rr(60, 150); BOULD.push([cos(a) * r, rr(-20, -9), sin(a) * r, 10 + rnd() * 12 | 0, rr(5, 9)]); }
  for (const b of BOULD) for (let i = 0; i < b[3]; i++) {
    const sc = rnd() < 0.12 ? rr(1.8, 3.2) : rr(0.35, 1.5);
    const x = b[0] + rr(-1, 1) * b[4], y = b[1] + rr(-1, 1) * b[4] * 0.6, z = b[2] + rr(-1, 1) * b[4];
    if (Dw(x, y, z) > -sc || nearFly(x, min(y, -2 - sc), z, sc + 4.5)) continue;
    const bob = rr(0.12, 0.4), sd = rnd();
    solid(rnd() * 4 | 0, x, min(y, -2 - sc), z, sc, qRand(), 1, sd, 1, bob);
    if (sc > 1.1) for (let j = 0; j < 7; j++) solid(rnd() * 4 | 0, x + rr(-1.6, 1.6) * sc, min(y, -2 - sc) + rr(-1.4, 1) * sc, z + rr(-1.6, 1.6) * sc, rr(0.1, 0.35), qRand(), 1, sd, 1, bob);
  }
  rseed(9);
  for (let i = 0; i < 2600; i++) {
    const k = pickV(), sc = rr(0.25, 1.3) * (rnd() < 0.1 ? 2 : 1); if (T.wn[k + 1] < 0.7 || hypot(T.wp[k], T.wp[k + 2]) > 170 || nearFly(T.wp[k], T.wp[k + 1], T.wp[k + 2], 6 + sc * 2)) continue;
    solid(rnd() * 4 | 0, T.wp[k], T.wp[k + 1] + sc * 0.2, T.wp[k + 2], sc, qRand(), 1, rnd(), 1, 0);
  }

  rseed(10);
  for (let i = 0; i < 60000; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2], ny = T.wn[k + 1];
    const sc = (0.35 + 2.1 * pow(rnd(), 2.6)) * (ny > 0.8 ? 0.5 : 1), q = qRand();
    if (hypot(x, z) > 172 || y > -3 || (ny > 0.8 && rnd() < 0.6) || nearFly(x, y, z, 3.5 + sc * 1.5)) continue;
    chunks[(sc > 1.15 ? 3 : 0) + (rnd() * 3 | 0)][cellOf(x, z)].push(x - T.wn[k] * sc * 0.3, y - ny * sc * 0.3, z - T.wn[k + 2] * sc * 0.3, sc, q[0], q[1], q[2], q[3], 1, rnd(), sc > 1.15 ? 0 : 96, 0);
  }
  rseed(11);
  for (let i = 0; i < 170000; i++) { // pebbles and rubble on the sea floor
    const k = pickV(), x = T.wp[k] + rr(-0.4, 0.4), z = T.wp[k + 2] + rr(-0.4, 0.4), y = T.wp[k + 1];
    if (T.wn[k + 1] < 0.8 || hypot(x, z) > 170 || nearFly(x, y, z, 1.3)) continue;
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

  // --- bubbles
  const VENTS = [[4, -44, -3], [4.5, -44, -3.5], [-1, -44, 2], [2, -44, -1], [5.5, -44, -7], [3, -44, -9], [6, -44, -90], [8, -44, -84], [4, -44, -93], [-9, -44, 3], [5, -35, -86], [9, -37, -92], [40, -44, 20], [-56, -44, 12], [10, -44, 80], [-2, -44, 30], [0, -44, -30], [12, -44, 2], [6, -44, -2], [46, -44, 30], [-20, -44, -103], [-52, -44, -12], [4, -44, 70], [9, -44, -74], [4, -44, -78], [14, -44, 26], [26, -44, 40], [-45, -44, -64], [-55, -44, -40], [-58, -44, 22], [-40, -44, 40], [-14, -44, 45], [-1, -44, -9], [-7, -44, -6]];
  rseed(13);
  for (const s of spots) if (rnd() < 0.28) VENTS.push(s);
  for (const v of VENTS) {
    const n = 90 + rnd() * 70 | 0, y0 = v[1] === -44 ? gy(v[0], v[2]) : v[1];
    for (let i = 0; i < n; i++) {
      const sz = rnd() < 0.12 ? rr(0.07, 0.16) : rr(0.015, 0.06);
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
  const hx = NX / 2, hy = NY / 2, hz = NZ / 2, volD = new Uint8Array(hx * hy * hz * 2);
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
      volD[o * 2] = clamp(0.5 - d / 12, 0, 1) * 255; volD[o * 2 + 1] = min(1, b) * 255;
    }
    const t = Lp; Lp = Ln; Ln = t;
  }

  // --- ground map: r magenta cover, b purple zone, a sand
  const gm = new Uint8Array(512 * 512 * 4);
  for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) {
    const x = (i + 0.5) / 512 * 384 - 192, z = (j + 0.5) / 512 * 384 - 192, o = (i + 512 * j) * 4;
    gm[o] = magAt(x, z) * 255; gm[o + 2] = zoneP(x, z) * 255; gm[o + 3] = sstep(0.42, 0.6, fbm(x * 0.04, 3, z * 0.04, 3)) * 255;
  }

  // --- fish schools + mantas
  // --- soft coral trees, anemones, polyp carpets and sea whips
  // tentacles (12 floats): root xyz, length | axis xyz, radius | kind, seed, colour, phase (see W_TENT)
  const tent = Array.from({ length: nCells }, () => []), ANEM = [];
  const tentacle = (x, y, z, len, d, r, kind, sd, col, ph) => tent[cellOf(x, z)].push(x, y, z, len, d[0], d[1], d[2], r, kind, sd, col, ph);
  // a terrain vertex within r of (x, z) facing up at least ny, deeper than 13 m, off the camera path
  const pickNear = (x, z, r, ny, clear = 3.5) => { for (let i = 0; i < 300000; i++) { const k = pickV(); if (hypot(T.wp[k] - x, T.wp[k + 2] - z) < r && T.wn[k + 1] >= ny && T.wp[k + 1] < -13 && !nearFly(T.wp[k], T.wp[k + 1], T.wp[k + 2], clear)) return k; } return -1; };
  const anemone = (k, sc) => {
    const x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2]; let nx = T.wn[k], ny = T.wn[k + 1] + 0.7, nz = T.wn[k + 2]; const l = hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const [t1, t2] = tangent([nx, ny, nz]), col = rnd(), ph = rnd(), N = 170 >> LV, R = 0.36 * sc;
    solid(35, x - nx * 0.06, y - ny * 0.06, z - nz * 0.06, sc, qFromY(nx, ny, nz), 7, col);
    const cx = x + nx * 0.22 * sc, cy = y + ny * 0.22 * sc, cz = z + nz * 0.22 * sc;
    for (let i = 0; i < N; i++) { // tentacles on a sunflower spiral over the disc, leaning outward toward the rim
      const f = sqrt((i + 0.5) / N), a = i * 2.39996, ca = cos(a), sa = sin(a), ox = t1[0] * ca + t2[0] * sa, oy = t1[1] * ca + t2[1] * sa, oz = t1[2] * ca + t2[2] * sa;
      let dx = nx + ox * f * 1.1, dy = ny + oy * f * 1.1, dz = nz + oz * f * 1.1; const dl = hypot(dx, dy, dz);
      tentacle(cx + ox * f * R, cy + oy * f * R, cz + oz * f * R, sc * rr(0.45, 0.7) * (0.75 + 0.4 * f), [dx / dl, dy / dl, dz / dl], 0.021 * sc * (LV ? 1.5 : 1), 0, rnd(), col, ph);
    }
    ANEM.push([cx + nx * 0.4 * sc, cy + ny * 0.4 * sc, cz + nz * 0.4 * sc, sc]);
  };
  rseed(16);
  // gardens get soft corals, anemones and a few sea whips; viewpoints 1 and 4 get an anemone or two in view
  for (const g of GARD) {
    for (let i = 0; i < 16; i++) { const k = pickNear(g[0], g[1], g[2] + 2, 0.5); if (k < 0) break; const lx = T.wn[k] * 0.4, lz = T.wn[k + 2] * 0.4, ll = hypot(lx, 1, lz), q = qMul(qFromY(lx / ll, 1 / ll, lz / ll), qAxis(0, 1, 0, rnd() * TAU)); solid(33 + (rnd() * 2 | 0), T.wp[k], T.wp[k + 1] - 0.05, T.wp[k + 2], rr(0.7, 1.9), q, 6, rnd()); }
    for (let i = 0; i < 4; i++) { const k = pickNear(g[0], g[1], g[2] + 1, 0.75, 6); if (k >= 0) anemone(k, rr(1.1, 2.1)); }
  }
  for (const a of [[-1.5, 2.5, 1.9], [-9, -9, 1.5], [3.5, -2, 1.3], [...rel(3, 6, -1.5), 2], [...rel(3, 10, 6.5), 1.5], [...rel(0, 6.5, -2.2), 1.7]]) { const k = pickNear(a[0], a[1], 1.6, 0.75); if (k >= 0) anemone(k, a[2]); }
  // scattered: sea whips in clumps on any rock, polyp carpets on up-facing rock
  for (let i = 0; i < 520; i++) {
    const k = pickV(), x = T.wp[k], y = T.wp[k + 1], z = T.wp[k + 2];
    if (hypot(x, z) > 165 || y > -12 || T.wn[k + 1] < -0.2 || nearFly(x, y, z, 3) || rnd() > zw(x, z)) continue;
    const n0 = [T.wn[k], T.wn[k + 1], T.wn[k + 2]], [t1, t2] = tangent(n0), col = rnd(), ph = rnd();
    if (i % 3) { // whips
      for (let j = 0, n = 4 + rnd() * 7 | 0; j < n; j++) {
        const a = rr(-0.5, 0.5), b = rr(-0.5, 0.5), s = snap(x + t1[0] * a + t2[0] * b, y + t1[1] * a + t2[1] * b, z + t1[2] * a + t2[2] * b, n0); if (!s) continue;
        let dx = s[3] * 0.5 + rr(-0.25, 0.25), dy = abs(s[4]) * 0.5 + 1, dz = s[5] * 0.5 + rr(-0.25, 0.25); const dl = hypot(dx, dy, dz);
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
  // 12 floats per fish: home xyz, radius | seed, speed, size, phase | colours, behaviour, two behaviour parameters
  // (see vsFish). One list per mesh: 0 bait, 1 slim, 2 triggerfish, 3 hunter, 4 clownfish, 5 disc, 6 idol, 7 parrotfish
  const fishK = Array.from({ length: 8 }, () => []);
  const fishAdd = (kind, x, y, z, R, speed, size, phase, col, beh, p1 = 1, p2 = 0) => fishK[kind].push(x, y, z, R, rnd(), speed, size, phase, col, beh, p1, p2);
  // open water within r of a point? (14 directions)
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; for (let i = 0; i < 8; i++) DIRS.push([i & 1 ? 0.58 : -0.58, i & 2 ? 0.58 : -0.58, i & 4 ? 0.58 : -0.58]);
  const open = (x, y, z, r) => { if (y + r > -1.5 || Dw(x, y, z) > 0) return false; for (const d of DIRS) if (Dw(x + d[0] * r, y + d[1] * r, z + d[2] * r) > 0) return false; return true; };
  // a point near (x, z), between lo and hi above the sea floor, with r of open water around it
  // open water over a flat loop of radius r, `up` above and below it? (what a loner swims)
  const openLoop = (x, y, z, r, up) => { if (Dw(x, y, z) > 0) return false; for (let k = 0; k < 24; k++) { const a = k * 0.785, q = r * (0.5 + 0.4 * (k >> 3)); for (const v of [-up, up]) if (y + v > -2 || Dw(x + cos(a) * q, y + v, z + sin(a) * q) > 0) return false; } return true; };
  // a point near (x, z), between lo and hi above the sea floor, with open water around it: a ball of radius r, or with
  // `up` given a loop of radius r
  const spot = (x, z, lo, hi, r, spread = 9, up = 0) => { for (let i = 0; i < 200; i++) { const px = x + rr(-spread, spread), pz = z + rr(-spread, spread), py = gy(px, pz) + rr(lo, hi); if (py < -13 && (up ? openLoop(px, py, pz, r, up) : open(px, py, pz, r) && open(px, py, pz, r * 0.5))) return [px, py, pz]; } return null; };
  rseed(14);
  const SCH = [[-2, -36, -10, 15, 520, 0.3, 1, 0.945], [8, -30, -70, 22, 420, 0.32, -1], [48, -30, 14, 18, 360, 0.3, 1], [-58, -30, -8, 11, 420, 0.28, -1, 0.3], [8, -36, 84, 16, 320, 0.28, 1],
    [-90, -28, -70, 25, 300, 0.3, 1], [95, -30, 70, 25, 300, 0.3, -1], [0, -22, 20, 30, 380, 0.34, -1], [-30, -30, -100, 18, 300, 0.3, 1], [16, -36, 30, 12, 300, 0.3, 1], [-48, -34, -58, 12, 300, 0.3, -1], [-45, -35, 38, 14, 320, 0.3, 1]];
  // the ribbon schools: silver bait fish, fusiliers, chromis and two small schools of blue tang
  const SK = [[0, 0], [1, 10], [1, 11], [1, 10], [1, 11], [5, 7], [1, 10], [0, 0], [1, 11], [5, 7], [1, 10], [1, 11]];
  SCH.forEach((s, j) => { const ss = s[7] === undefined ? rnd() : s[7], [kind, col] = SK[j], tang = kind === 5; for (let i = 0; i < (tang ? 70 : s[4]); i++) fishAdd(kind, s[0], s[1], s[2], s[3], s[6] * 1.9 / s[3], tang ? 0.42 : s[5] * (kind ? 1.15 : 1), ss, col, 0, tang ? 0.5 : 1); });
  // anthias: a cloud over every sponge and coral garden, around the whale tail and the barrel sponges of viewpoint 4
  rseed(15);
  const SPOTS = []; // [mesh kind, x, y, z] of clouds and loners, for the dev tools
  const CLOUD = GARD.map((g) => [g[0], g[1], min(g[2] * 0.6, 4.2)]); CLOUD.push([-5, -4, 3.2], [...rel(3, 9, 3.5), 3.5], [-2, 6, 2.6], [4, -8, 2.6]);
  for (const c of CLOUD) {
    const p = spot(c[0], c[1], 1.4, 2.4, 1, 1.5); if (!p) continue;
    const ph = rnd(); SPOTS.push([1, ...p]);
    for (let i = 0; i < 130; i++) fishAdd(1, p[0], p[1], p[2], c[2], 0, 0.24, ph, rnd() < 0.25 ? 2 : 1, 1, 1, rnd() * 0.04);
  }
  // clownfish: three or four hovering in each anemone
  for (const a of ANEM) { const ph = rnd(); for (let i = 0, n = 3 + (rnd() * 2 | 0); i < n; i++) fishAdd(4, a[0], a[1] - 0.12 * a[3], a[2], 0.34 * a[3], 0, rr(0.3, 0.42), ph, 5, 1, 0.45, rnd() * 0.3); }
  // bait balls in open water, each with two hunters that have two followers
  const BALLS = [];
  for (const b of [[-2, -25, 24], [26, -22, -46], [-40, -24, -36]]) {
    // the nearest place to the wanted one with 8 m of open water all round, searching outward and a little up and down
    let p = null;
    for (let i = 0; i < 4000 && !p; i++) { const s = i / 4000 * 30, x = b[0] + rr(-s, s), y = b[1] + rr(-s, s) * 0.25, z = b[2] + rr(-s, s); if (y < -16 && open(x, y, z, 8) && open(x, y, z, 4)) p = [x, y, z]; }
    if (!p) continue;
    const ph = rnd(); BALLS.push(p);
    for (let i = 0; i < 2400 / THIN; i++) fishAdd(0, p[0], p[1], p[2], 4.2, 0, 0.25, ph, 0, 2);
    for (let k = 0; k < 2; k++) for (let f = 0; f < 3; f++) fishAdd(3, p[0], p[1], p[2], 4.2, 0, f ? 1.6 : 2.1, ph, 4, 3, k, f);
  }
  // loners near the gardens: triggerfish, parrotfish, pairs of butterflyfish and idols
  const loner = (kind, col, n, lo, hi, r0, r1, s0, s1, w0, w1, pair) => {
    for (let i = 0; i < n; i++) {
      const g = GARD[(rnd() * GARD.length) | 0], R = rr(r0, r1), up = min(rr(0.4, 1.3), lo - 0.5), p = spot(g[0], g[1], lo, hi, R * 1.3, 14, up + 0.4); if (!p) continue;
      const w = rr(w0, w1) * (rnd() < 0.5 ? -1 : 1), ph = rnd(), ps = rnd(); SPOTS.push([kind, ...p]);
      fishAdd(kind, p[0], p[1], p[2], R, w, rr(s0, s1), ph, col, 4, up, ps);
      if (pair) fishAdd(kind, p[0], p[1], p[2], R, w, rr(s0, s1), ph + 0.9 / (R * TAU) * sign(w), col, 4, up, ps);
    }
  };
  loner(2, 3, 16, 2.5, 6, 3.5, 6, 0.6, 0.9, 0.06, 0.1);
  loner(7, 9, 18, 1.6, 3, 3, 5, 0.6, 0.8, 0.07, 0.11);
  loner(5, 6, 22, 1.5, 4, 2.5, 4.5, 0.34, 0.4, 0.1, 0.16, 1);
  loner(6, 8, 10, 2, 5, 3, 5, 0.4, 0.46, 0.09, 0.14, 1);
  const fish = [], fishR = []; { let n = 0; for (const a of fishK) { fishR.push([n, a.length / 12]); n += a.length / 12; for (let i = 0; i < a.length; i++) fish.push(a[i]); } }
  const mantas = [];
  for (const m of [[1, -28, 3.5, 14, 3.012, 0.085, 3.6, 0.1], [49, -31, 24.5, 5, 0.029, -0.08, 3.7, 0.4], [0, -14, -80, 34, 0.3, 0.06, 5.2, 0.7], [-50, -18, 20, 26, 5, -0.075, 3.8, 0.55], [10, -16, 86, 26, 2.2, 0.07, 4.4, 0.85], [20, -11, -20, 46, 4.2, -0.045, 5.6, 0.25]]) mantas.push(...m);

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
  return { gy, glints: new Float32Array(glints), chunks: chunks.map(packC), props: props.map(packC), tent: packC(tent), ANEM, big: pack(big), bigF: pack(big, 2, 1.5), small: pack(small), solids: { data: new Float32Array(sol.data), ranges: sol.ranges }, bubbles: new Float32Array(bubbles), volD, gm, fish: new Float32Array(fish), fishR, BALLS, SPOTS, mantas: new Float32Array(mantas), snow };
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
// soft coral tree: a fat trunk, a few branches, swollen tips (aux rises to 1 at the tips: paler and glowing)
function meshSoft(sd) {
  rseed(230 + sd);
  const m = new Mesh(), nrm = (v) => { const l = hypot(...v) || 1; return v.map((c) => c / l); };
  const br = (p, d, r, len, depth) => {
    const pts = [p]; let q = p;
    for (let i = 0; i < 3; i++) { d = nrm([d[0] + rr(-0.25, 0.25), d[1] + rr(0, 0.3), d[2] + rr(-0.25, 0.25)]); q = [q[0] + d[0] * len / 3, q[1] + d[1] * len / 3, q[2] + d[2] * len / 3]; pts.push(q); }
    if (depth) {
      m.tube(pts, (k) => r * (1 - 0.1 * k), LV > 1 ? 4 : 9, false, () => 0.2 + 0.12 * (2 - depth));
      for (let i = 0, n = 3 + (rnd() < 0.5); i < n; i++) br(q, nrm([d[0] + rr(-0.9, 0.9), d[1] + rr(0, 0.5), d[2] + rr(-0.9, 0.9)]), r * 0.62, len * 0.7, depth - 1);
    } else { pts.push([q[0] + d[0] * r * 2.4, q[1] + d[1] * r * 2.4, q[2] + d[2] * r * 2.4]); // the swollen tip, as a smooth bulb of 8 rings
      const tp = []; for (let k = 0; k <= 8; k++) { const f = k / 8, a = pts[min(4, f * 4 | 0)], b = pts[min(4, (f * 4 | 0) + 1)], g = f * 4 - (f * 4 | 0); tp.push([mix(a[0], b[0], g), mix(a[1], b[1], g), mix(a[2], b[2], g)]); }
      m.tube(tp, (k) => r * (0.8 + 1.5 * pow(sin(PI * pow(k / 8.4, 1.5)), 1.2)), LV > 1 ? 4 : 9, true, (k) => 0.44 + k * 0.07); }
  };
  br([0, 0, 0], [0, 1, 0], 0.13, 0.55, 2);
  return m;
}
function meshTubes() {
  rseed(210);
  const m = new Mesh(), N = LV > 1 ? 8 : 14;
  // each tube is rings around a straight leaning axis: up the outside, over a rounded lip, down into a dark throat
  const PR = [[0, 0.8, 0.35], [0.3, 0.86, 0.55], [0.62, 0.95, 0.8], [0.86, 1.06, 1], [0.95, 1.1, 1], [1, 1.02, 1], [1.01, 0.9, 0.8], [0.97, 0.76, 0.4], [0.8, 0.66, 0.12], [0.55, 0.6, 0.04]];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, r0 = rr(0, 0.28), h = rr(0.45, 1.1), rad = rr(0.07, 0.12), lean = rr(0.05, 0.3), ph = rnd() * TAU, rings = [];
    const bx = cos(a) * r0, bz = sin(a) * r0, dx = cos(a) * lean * h, dz = sin(a) * lean * h;
    for (const [t, rf, ao] of PR) { const ring = []; for (let s = 0; s < N; s++) { const an = s / N * TAU, rl = rad * rf * (1 + 0.07 * sin(an * 3 + ph + t * 2)); ring.push(m.v(bx + dx * t + cos(an) * rl, h * t, bz + dz * t + sin(an) * rl, ao)); } rings.push(ring); }
    for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < N; s++) { const s2 = (s + 1) % N; m.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]); }
    const c = m.v(bx + dx * 0.5, h * 0.5, bz + dz * 0.5, 0.02), last = rings[rings.length - 1];
    for (let s = 0; s < N; s++) m.tri(last[s], c, last[(s + 1) % N]);
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
// Fish: nose at +x, tail at -x, about 1 long. H and W are the half height and half width of the body rings at FISHX.
// Fins are flat sheets, given as base x, y, tip x, y, ... along the fin. aux is 0 on the body and rises to 1 at the fin
// tips (negative on the paired side fins): the shader ripples, tints and lights the fins with it.
const FISHX = [0.5, 0.42, 0.25, 0.02, -0.2, -0.35, -0.42];
function meshFishKind(H, W, fins, pec = 0.16, R = 12) {
  const m = new Mesh(), rings = [], fine = R > 6, NR = fine ? 15 : 7;
  // Catmull-Rom spline through a list of control values
  const cr = (a, b, c, d, u) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  const ring = (A, f) => { const i = min(5, floor(f)); return cr(A[max(i - 1, 0)], A[i], A[i + 1], A[min(i + 2, 6)], f - i); };
  for (let i = 0; i < NR; i++) {
    const f = i / (NR - 1) * 6, x = ring(FISHX, f), h = max(ring(H, f), 0.004), w = max(ring(W, f), 0.003), r = [];
    for (let k = 0; k < R; k++) { const a = k / R * TAU; r.push(m.v(x, sin(a) * h, cos(a) * w, 0)); }
    rings.push(r);
  }
  for (let i = 0; i < NR - 1; i++) for (let k = 0; k < R; k++) { const k2 = (k + 1) % R; m.quad(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]); }
  const c0 = m.v(FISHX[0] + H[0] * 0.6, 0, 0, 0), c1 = m.v(FISHX[6] - 0.01, 0, 0, 0);
  for (let k = 0; k < R; k++) { const k2 = (k + 1) % R; m.tri(c0, rings[0][k2], rings[0][k]); m.tri(c1, rings[NR - 1][k], rings[NR - 1][k2]); }
  // a fin: its base and tip outlines are splined through the given points, with a row halfway out
  const sheet = (f, z0, z1, sg) => {
    const P = f.length / 4, sub = fine ? 3 : 1, at = (j, c) => f[min(max(j, 0), P - 1) * 4 + c], rows = [];
    for (let j = 0; j <= (P - 1) * sub; j++) {
      const i = min(P - 2, floor(j / sub)), u = j / sub - i, q = [0, 1, 2, 3].map((c) => cr(at(i - 1, c), at(i, c), at(i + 1, c), at(i + 2, c), u));
      rows.push([m.v(q[0], q[1], z0, 0.04 * sg), m.v((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, (z0 + z1) / 2, 0.5 * sg), m.v(q[2], q[3], z1, sg)]);
    }
    for (let j = 1; j < rows.length; j++) for (let c = 0; c < 2; c++) m.quad(rows[j - 1][c], rows[j][c], rows[j][c + 1], rows[j - 1][c + 1]);
  };
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
    meshFishKind(slimH, slimW, [tail(0.035, 0.3, 0.2, 0.7), [0.22, 0.12, 0.23, 0.15, 0.14, 0.14, 0.09, 0.3, 0.04, 0.15, -0.01, 0.21, -0.12, 0.13, -0.16, 0.2, -0.26, 0.085, -0.33, 0.15, -0.34, 0.055, -0.37, 0.07],
      [-0.06, -0.14, -0.08, -0.16, -0.16, -0.12, -0.26, -0.21, -0.3, -0.07, -0.36, -0.1], [0.14, -0.135, 0.13, -0.15, 0.1, -0.14, -0.02, -0.25, 0.05, -0.148, 0.03, -0.165]], 0.1),
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
    meshFishKind(discH, discW, [[0.26, 0.24, 0.25, 0.27, 0.1, 0.3, 0.08, 0.38, 0.03, 0.32, -0.02, 0.6, -0.02, 0.32, -0.5, 1, -0.06, 0.31, -0.16, 0.6, -0.2, 0.26, -0.28, 0.4, -0.34, 0.095, -0.39, 0.16], flip(ridge), tail(0.045, 0.2, 0.2, 0.3)], 0.14),
    // parrotfish: blunt head, low fins, crescent tail
    meshFishKind([0.05, 0.11, 0.16, 0.17, 0.12, 0.06, 0.045], [0.03, 0.06, 0.085, 0.09, 0.06, 0.025, 0.015], [low, flip(low), tail(0.045, 0.26, 0.26, 0.7)], 0.2),
  ];
}

