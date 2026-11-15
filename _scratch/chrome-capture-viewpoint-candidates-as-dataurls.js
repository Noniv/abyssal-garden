// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// Candidate viewpoints for the new life: (a) each bait ball at the moment hunter 0 cuts through it (time computed
// with the hunter() formula from the fish shader), from two directions; (b) the three anemones with the most
// anemone neighbours, from three directions. The JSON also lists the camera numbers used for each shot.
// Decode with _scratch/decode-captured-dataurls-to-images.mjs.
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, F = d.fish, out = { size: d.size, shots: {}, cams: {} };
  const grab = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(canvas.toDataURL('image/jpeg', 0.92))))));
  let n = 0; const shot = async (label, ...a) => { const name = 'fly_' + String(n++).padStart(2, '0') + '_' + label; d.look(...a); out.cams[name] = a.map((v) => +v.toFixed(2)); out.shots[name] = await grab(); };
  // ball phases: the bait list starts with the two silver ribbon schools, then 2400 fish per ball
  const first = d.fishRanges[0][0], total = d.fishRanges[0][1], per = 2400, start = total - per * d.balls.length;
  for (let j = 0; j < d.balls.length; j++) {
    const o = (first + start + j * per) * 12, ph = F[o + 7], b = d.balls[j];
    let t = (Math.PI / 2 - ph * 6.3) / 0.13; while (t < 12) t += Math.PI / 0.13;
    for (const [dx, dz] of [[11, 8], [-9, 10]]) for (const dt of [-1.0, 0.2]) await shot(`ball${j}_dir${dx}_t${(t + dt).toFixed(1)}`, b[0] + dx, b[1] - 2.5, b[2] + dz, b[0], b[1] + 0.5, b[2], t + dt);
  }
  const A = d.anemones, score = A.map((a, i) => [A.filter((q) => Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]) < 7).length, i]).sort((x, y) => y[0] - x[0]);
  for (const [, i] of score.slice(0, 5).filter((_, k) => k % 2 === 0)) { const a = A[i]; for (const an of [0.6, 2.7, 4.8]) await shot(`anemone${i}_dir${an}`, a[0] + Math.cos(an) * 4.2, a[1] + 1.1, a[2] + Math.sin(an) * 4.2, a[0], a[1] - 0.1, a[2], 20); }
  return out;
}
