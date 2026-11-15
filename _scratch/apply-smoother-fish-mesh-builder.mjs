// One-off edit script: replaces meshFishKind in world.js with a smoother builder (body resampled with Catmull-Rom
// to 15 rings x 12 sides, fin outlines interpolated to curves with a middle row). Bait fish stay cheap (7 x 6).
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('../source/src/world.js', import.meta.url); let s = readFileSync(p, 'utf8');
const a = s.indexOf('function meshFishKind('), b = s.indexOf('// the eight fish shapes');
if (a < 0 || b < a) throw new Error('markers not found');
s = s.slice(0, a) + `function meshFishKind(H, W, fins, pec = 0.16, R = 12) {
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
` + s.slice(b);
writeFileSync(p, s); console.log('ok');
