// One-off edit script: replaces buildTerrain in world.js. On High the surface-nets quads are split in four with
// normal-following (Hermite) edge midpoints plus a little noise along the normal, so rock outlines are rounded and
// eroded. The coarse vertices (wp, wn, nv) are returned unchanged for the world generator's placement code.
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('../source/src/world.js', import.meta.url); let s = readFileSync(p, 'utf8');
const a = s.indexOf('function buildTerrain(D) {'), b = s.indexOf('\n}\n', a) + 3;
if (a < 0) throw new Error('buildTerrain not found');
s = s.slice(0, a) + `function buildTerrain(D) {
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
  // the generator places things on the coarse vertices (world space)
  const wp = new Float32Array(nv * 3), wn = gn.slice(0, nv * 3);
  for (let k = 0; k < nv; k++) { wp[k * 3] = OX + gp[k * 3] * VS; wp[k * 3 + 1] = OY + gp[k * 3 + 1] * VS; wp[k * 3 + 2] = OZ + gp[k * 3 + 2] * VS; }
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
  const per = fine ? 24 : 6, ib = new Uint32Array(nq * per), fill = cnt.slice();
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
      put(o, v0, e0, c, e3); put(o + 6, e0, v1, e1, c); put(o + 12, c, e1, v2, e2); put(o + 18, e3, c, e2, v3);
    }
    for (let k = nv; k < nf; k++) normalAt(k);
    for (let c = 0; c <= CELLS * CELLS; c++) cnt[c] *= 4;
  }
  const vb = new ArrayBuffer(nf * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  for (let k = 0; k < nf; k++) {
    const nx = gn[k * 3], ny = gn[k * 3 + 1], nz = gn[k * 3 + 2];
    let X = OX + gp[k * 3] * VS, Y = OY + gp[k * 3 + 1] * VS, Z = OZ + gp[k * 3 + 2] * VS;
    // erosion: two scales of noise pushed along the normal (a few centimetres, so what stands on the rock still does)
    if (fine) { const e = (fbm(X * 1.1, Y * 1.1, Z * 1.1, 3) - 0.5) * 0.24 + (vnoise(X * 4.3, Y * 4.3, Z * 4.3) - 0.5) * 0.07; X += nx * e; Y += ny * e; Z += nz * e; }
    vf[k * 4] = X; vf[k * 4 + 1] = Y; vf[k * 4 + 2] = Z;
    v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = 127;
  }
  return { vb, ib, nv, wp, wn, smp, start: cnt, lo, hi };
}
` + s.slice(b);
writeFileSync(p, s); console.log('ok');
