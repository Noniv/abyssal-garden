// ============================================================================
// development tools: only in dev.html (npm run build:dev), never in index.html
// ============================================================================
//   F    fly the camera along the scripted path (FLY in main.js), one minute through the whole world
//   B    the same flight as a benchmark: the resolution stays fixed, every frame is timed, the result is shown at the end
//   F, B or 1-6 during a flight stop it
{
  window.camTo = (x, y, z, yaw, pitch) => { F[CX] = x; F[CY] = y; F[CZ] = z; F[YAW] = yaw; F[PIT] = pitch; F[VX] = F[VY] = F[VZ] = 0; };
  window.diveIn = () => ui(false);
  window.audioState = () => AC ? [AC.state, +AC.currentTime.toFixed(2), +OUT.gain.value.toFixed(3), muted] : 'no AC';
  window.bodyAt = (manta, i, dx, dy, dz) => { const a = manta ? Wd.mantas : Wd.sharks; bodyPose(a, i * 8, F[TIME], manta); const sz = a[i * 8 + 6]; window.camTo(BP[0] + (BP[3] * dx + BP[6] * dy + BP[9] * dz) * sz, BP[1] + (BP[4] * dx + BP[7] * dy + BP[10] * dz) * sz, BP[2] + (BP[5] * dx + BP[8] * dy + BP[11] * dz) * sz, 0, 0); return [a[i * 8 + 6], ...BP]; };
  window.bodyRel = (manta, i) => { const a = manta ? Wd.mantas : Wd.sharks; bodyPose(a, i * 8, F[TIME], manta); const sz = a[i * 8 + 6], d = [F[CX] - BP[0], F[CY] - BP[1], F[CZ] - BP[2]]; return [(d[0] * BP[3] + d[1] * BP[4] + d[2] * BP[5]) / sz, (d[0] * BP[6] + d[1] * BP[7] + d[2] * BP[8]) / sz, (d[0] * BP[9] + d[1] * BP[10] + d[2] * BP[11]) / sz]; };
  window.bodyQ = (manta, i) => { const a = manta ? Wd.mantas : Wd.sharks; bodyPose(a, i * 8, F[TIME], manta); const sz = a[i * 8 + 6], dx = F[CX] - BP[0], dy = F[CY] - BP[1], dz = F[CZ] - BP[2], r = CR / sz; let best = 9; for (const e of (manta ? MANTA_E : SHARK_E)) { const lx = (dx * BP[3] + dy * BP[4] + dz * BP[5]) / sz - e[0], ly = (dx * BP[6] + dy * BP[7] + dz * BP[8]) / sz - e[1], lz = (dx * BP[9] + dy * BP[10] + dz * BP[11]) / sz - e[2]; best = Math.min(best, Math.hypot(lx / (e[3] + r), ly / (e[4] + r), lz / (e[5] + r))); } return +best.toFixed(2); };
  window.mapDump = () => JSON.stringify({ h: Array.from(Wd.mapH, (v) => +v.toFixed(1)), t: Array.from(Wd.mapT, (v) => +v.toFixed(1)) });
  // walks each tunnel's path: is it clear for the camera (sphere CR), and how much rock closes around it?
  window.tunnelProbe = () => {
    const rock = (x, y, z) => { F[CX] = x; F[CY] = y; F[CZ] = z; sd(0); return CS[0] > 0; };
    const out = {}; const save = [F[CX], F[CY], F[CZ]];
    for (const t of TUNNELS) {
      const rows = []; let blocked = 0, n = 0;
      for (let s = 0; s <= t.len; s += 1) {
        let i = 0; while (i < t.pts.length - 2 && t.cum[i + 1] < s) i++;
        const a = t.pts[i], b = t.pts[i + 1], h = (s - t.cum[i]) / (t.cum[i + 1] - t.cum[i]), p = [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * h);
        F[CX] = p[0]; F[CY] = p[1]; F[CZ] = p[2]; sd(0); const clear = -CS[0], isBlocked = CS[0] + CR > 0;
        let hit = 0; for (let k = 0; k < 16; k++) { const az = k / 16 * 6.2832, ey = (k % 4 - 1.5) * 0.5, dx = Math.cos(az), dz = Math.sin(az); let h8 = 0; for (let r = 2; r <= 12; r += 1.5) if (rock(p[0] + dx * r, p[1] + ey * r, p[2] + dz * r)) { h8 = 1; break; } hit += h8; }
        n++; if (isBlocked) blocked++; rows.push([+s.toFixed(0), +clear.toFixed(2), hit / 16]);
      }
      out[t.id] = { len: +t.len.toFixed(0), blockedPct: +(100 * blocked / n).toFixed(0), blockedAt: rows.filter((r) => r[1] < -0.0 - 0 && false).length, rows: rows.filter((r, k) => k % 4 === 0).map((r) => r.join('/')).join(' ') };
    }
    F[CX] = save[0]; F[CY] = save[1]; F[CZ] = save[2]; return JSON.stringify(out);
  };
  // does any body point, over a whole lap of every shark and ray, touch rock (collision field, independent of the generator's check)?
  window.bodiesProbe = () => {
    const rep = []; const save = [F[CX], F[CY], F[CZ]];
    for (const [manta, a] of [[0, Wd.sharks], [1, Wd.mantas]]) for (let o = 0; o < a.length; o += 8) {
      const E = manta ? MANTA_E : SHARK_E, sz = a[o + 6]; let worst = 9, bad = 0, n = 0;
      for (let k = 0; k < 240; k++) {
        bodyPose(a, o, (k / 240 * 6.2832 - a[o + 4]) / a[o + 5], manta);
        for (const e of E) for (const q of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const lx = e[0] + q[0] * e[3], ly = e[1] + q[1] * e[4], lz = e[2] + q[2] * e[5];
          F[CX] = BP[0] + (BP[3] * lx + BP[6] * ly + BP[9] * lz) * sz; F[CY] = BP[1] + (BP[4] * lx + BP[7] * ly + BP[10] * lz) * sz; F[CZ] = BP[2] + (BP[5] * lx + BP[8] * ly + BP[11] * lz) * sz;
          sd(0); n++; if (CS[0] > -0.02) bad++; if (CS[0] < worst) worst = CS[0];
        }
      }
      rep.push((manta ? 'manta' : 'shark') + (o / 8) + ': size ' + sz.toFixed(1) + ' R ' + a[o + 3].toFixed(1) + ' touching ' + bad + '/' + n);
    }
    F[CX] = save[0]; F[CY] = save[1]; F[CZ] = save[2]; return JSON.stringify(rep);
  };
  window.torchState = () => [+torchV.toFixed(2), torchOn, +tunnelDark(F[CX], F[CY], F[CZ]).toFixed(2)];
  window.nurseList = () => JSON.stringify(Array.from({ length: Wd.nurse.length / 16 }, (_, i) => Array.from(Wd.nurse.slice(i * 16, i * 16 + 8), (v) => +v.toFixed(7))));
  // how far above (+) or below (-) the shark's belly the real ground is, along its body (collision field, scanned downward)
  window.nurseFloorCheck = () => {
    const out = []; const save = [F[CX], F[CY], F[CZ]];
    for (let o = 0; o < Wd.nurse.length; o += 16) {
      const a = Wd.nurse, [x, y, z, yaw, , sz, , bend] = Array.from(a.slice(o, o + 8)), row = [], hx = Math.sin(yaw), hz = Math.cos(yaw);
      for (const zz of [1.1, 0.6, 0.1, -0.4, -0.9, -1.4, -1.9]) for (const lat of [-0.12, 0, 0.12]) {
        const dx = bendAt(zz, bend) + lat, px = x + (hx * zz + hz * dx) * sz, pz = z + (hz * zz - hx * dx) * sz;
        let ground = null; for (let yy = y + 1.5; yy > y - 1.5; yy -= 0.01) { F[CX] = px; F[CY] = yy; F[CZ] = pz; sd(0); if (CS[0] > -0.001) { ground = yy; break; } }
        const bellyY = y + Math.tan(a[o + 4]) * zz * sz - 0.52 * nurseAt(nurseZ0(zz))[0] * sz; // belly bottom at this z (rigid body)
        const cl = ground === null ? null : bellyY - ground; // + = belly above the ground (gap), - = belly in the ground
        if (cl !== null) row.push(+cl.toFixed(2));
      }
      out.push([Math.min(...row), Math.max(...row)]);
    }
    F[CX] = save[0]; F[CY] = save[1]; F[CZ] = save[2];
    return JSON.stringify(out);
  };
  window.pupState = () => JSON.stringify(Array.from(PUP, (v) => +v.toFixed(2)));
  window.pupBlocked = () => { const out = []; for (let o = 0; o < PUP.length; o += 8) { let bad = 0, n = 0; for (const e of SHARK_E) for (const q of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const sz = PUP[o + 5], cy = Math.cos(PUP[o + 3]), sy = Math.sin(PUP[o + 3]), cp = Math.cos(PUP[o + 4]), sp = Math.sin(PUP[o + 4]); const lx = e[0] + q[0] * e[3], ly = e[1] + q[1] * e[4], lz = e[2] + q[2] * e[5]; const x = PUP[o] + (cy * lx + sy * cp * lz - sy * sp * ly) * sz, y = PUP[o + 1] + (cp * ly + sp * lz) * sz, z = PUP[o + 2] + (-sy * lx + cy * cp * lz - cy * sp * ly) * sz; n++; const sv = sdAt(x, y, z); if (sv > 0.0) bad += 1000; else if (sv > -0.02) bad++; } out.push((bad >= 1000 ? 'INSIDE ' + Math.floor(bad / 1000) + ' + ' : '') + (bad % 1000) + ' grazing /' + n); } return JSON.stringify(out); };
  window.pupHold = () => { pupSpeed.fill(0); };
  window.plantStats = () => { const v = []; for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) { const x = (i + 0.5) * 2.5 - 160, z = (j + 0.5) * 2.5 - 160; if (Math.hypot(x, z) < 130) v.push(PLANT[i + 128 * j]); } v.sort((a, b) => a - b); const p = (q) => v[Math.floor(q * (v.length - 1))]; return JSON.stringify({ cells: v.length, p50: p(0.5), p70: p(0.7), p80: p(0.8), p90: p(0.9), p95: p(0.95), denseShare: +(100 * v.filter((a) => a >= PLANT_DENSE).length / v.length).toFixed(0) }); };
  window.probeAround = (x, y, z) => { const out = []; for (let k = 0; k < 12; k++) { const a = k * 0.5236; let d = 0, why = ''; for (; d < 15; d += 1.5) { const px = x + Math.sin(a) * (d + 1.5), pz = z + Math.cos(a) * (d + 1.5); if (sdAt(px, y, pz) > -0.6) { why = 'rock'; break; } if (plantAt(px, pz)) { why = 'plant'; break; } } out.push(Math.round(d) + why[0]); } return JSON.stringify({ here: [+sdAt(x, y, z).toFixed(2), plantDens(x, z)], ring: out.join(' ') }); };
  window.setTime = (t) => { F[TIME] = t; };
  window.nurseEye = (i, side) => { const a = Wd.nurse, o = i * 16, yaw = a[o + 3], pit = a[o + 4], sz = a[o + 5], A = a[o + 7], lx = side * 0.1419 + bendAt(0.965, A), ly = 0.0404, lz = 0.965; const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit); const S = [cy, 0, -sy], U = [-sy * sp, cp, -cy * sp], T = [sy * cp, sp, cy * cp]; return [a[o] + (S[0] * lx + U[0] * ly + T[0] * lz) * sz, a[o + 1] + (S[1] * lx + U[1] * ly + T[1] * lz) * sz, a[o + 2] + (S[2] * lx + U[2] * ly + T[2] * lz) * sz]; };
  window.pupBend = () => JSON.stringify(Array.from(PUPB, (v) => +v.toFixed(2)));
  let followI = -1; window.pupFollow = (i) => { followI = i; };
  window.pupStuckLog = () => JSON.stringify(pupLog);
  window.pupRuns = (x, y, z, sz) => JSON.stringify(Array.from({ length: 24 }, (_, k) => Math.round(pupRun(x, y, z, k * 0.2618, sz, 14))));
  window.camGet = () => [F[CX], F[CY], F[CZ], F[VX], F[VY], F[VZ]];
  const LOGN = 1 << 16, logFrame = new Float32Array(LOGN), logGpu = new Float32Array(LOGN);
  let flying = false, bench = false, last = 0, nFrame = 0, nGpu = 0;
  const stop = () => { flying = bench = false; dynT = 0; };
  const report = () => {
    const st = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y); let sum = 0; for (const v of s) sum += v; return { n, avg: sum / n, p99: s[min(n - 1, floor(n * 0.99))], max: s[n - 1] }; };
    const fm = (o) => `avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms`;
    const f = st(logFrame, nFrame);
    info.textContent = `Fly-through ${W}x${H}, ${f.n} frames\nframe  ${fm(f)}\nGPU    ${nGpu ? fm(st(logGpu, nGpu)) : 'timestamp-query unavailable'}`;
  };
  // frame() moves the free camera and then calls render(): step in between and put the camera on the path instead
  const draw = render;
  let lockT = null; window.timeLock = (t) => { lockT = t; };
  render = () => {
    if (lockT !== null) F[TIME] = lockT;
    if (followI >= 0) { const o = followI * 8, yw = PUP[o + 3]; lookAt(PUP[o] + cos(yw) * 5.2 - sin(yw) * 1.5, PUP[o + 1] + 0.7, PUP[o + 2] - sin(yw) * 5.2 - cos(yw) * 1.5, PUP[o], PUP[o + 1], PUP[o + 2]); }
    if (flying) {
      const dtr = F[LAST] - last; last = F[LAST];
      F[FLT] += min(dtr / 1000, 0.1); flyAt();
      if (bench) { if (nFrame < LOGN) logFrame[nFrame++] = dtr; if (F[GPU] > 0 && nGpu < LOGN) logGpu[nGpu++] = F[GPU]; }
      if (F[FLT] >= FLYT) { if (bench) report(); stop(); }
    }
    draw();
  };
  addEventListener('keydown', (e) => {
    if (menu || e.repeat) return;
    if (e.code === 'KeyF' || e.code === 'KeyB') {
      if (flying) stop();
      else {
        flying = true; bench = e.code === 'KeyB'; F[FLT] = 0; last = F[LAST]; nFrame = nGpu = 0;
        // a benchmark hides the stats line and holds the resolution: dynT at -Infinity keeps frame() from tuning it
        if (bench) { hud = false; info.textContent = ''; dynT = -Infinity; }
      }
    } else if (/Digit[1-6]/.test(e.code)) stop();
  });
}
