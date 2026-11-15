// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// Side-on portraits of one fish of each kind, close enough to judge mesh and pattern. For loners (behaviour 4) the
// position at the frozen time is recomputed here with the same formula as fpos() in the fish shader; for the other
// kinds the camera goes to the group's home. Also wide shots of each bait ball at three moments.
// Decode with _scratch/decode-captured-dataurls-to-images.mjs.
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, F = d.fish, out = { size: d.size, shots: {} };
  const grab = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(canvas.toDataURL('image/jpeg', 0.92))))));
  let n = 0; const shot = async (label, ...a) => { d.look(...a); out.shots['fly_' + String(n++).padStart(2, '0') + '_' + label] = await grab(); };
  const T = 20;
  const loner = (o, t) => {
    const R = F[o + 3], w = F[o + 5], ph = F[o + 7], up = F[o + 10], ps = F[o + 11], u0 = t * w + ph * 6.3, u = u0 - 0.27 * Math.sin(u0 * 3);
    return [F[o] + R * Math.cos(u) + R * 0.3 * Math.cos(2.7 * u + ps * 9), F[o + 1] + up * Math.sin(1.9 * u + ps * 5), F[o + 2] + R * 0.7 * Math.sin(u) + R * 0.3 * Math.sin(2.3 * u + ps * 4)];
  };
  const names = ['bait', 'slim', 'trigger', 'hunter', 'clown', 'disc', 'idol', 'parrot'];
  for (let k = 0; k < 8; k++) {
    const [first, count] = d.fishRanges[k]; let done = 0;
    for (let i = 0; i < count && done < 2; i++) {
      const o = (first + i) * 12; if (F[o + 9] !== 4) continue;
      const p = loner(o, T), q = loner(o, T + 0.1), vx = q[0] - p[0], vz = q[2] - p[2], l = Math.hypot(vx, vz) || 1, sz = F[o + 6], dist = sz * 2.6;
      // camera to the fish's side, slightly ahead and above
      await shot(names[k] + done, p[0] - vz / l * dist + vx / l * sz * 0.3, p[1] + sz * 0.25, p[2] + vx / l * dist + vz / l * sz * 0.3, p[0], p[1], p[2], T);
      done++; i += 7;
    }
  }
  const cl = d.spots.filter((s) => s[0] === 1);
  for (const i of [0, 3]) if (cl[i]) await shot('anthias' + i, cl[i][1] + 1.6, cl[i][2] + 0.5, cl[i][3] + 1.2, cl[i][1], cl[i][2] + 0.3, cl[i][3], T);
  for (let j = 0; j < d.balls.length; j++) { const b = d.balls[j]; for (const t of [20, 30]) await shot('ball' + j + '_t' + t, b[0] + 10, b[1] - 2, b[2] + 7, b[0], b[1], b[2], t); }
  out.spots = d.spots.map((s) => s.map((v) => +v.toFixed(1)));
  return out;
}
