// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file).
// Looks for where a GPU spike comes from on the scripted flight between 4 s and 7 s:
// (a) plays that stretch three times in real time (camera placed per frame from the wall clock) and records every
//     frame whose GPU time exceeds 14 ms, with the flight time it happened at;
// (b) holds the camera still at each 0.1 s step with the scene clock running, and reports the steady GPU time there.
async () => {
  const d = window.dev, raf = () => new Promise((r) => requestAnimationFrame(r)), out = { passes: [], steady: [] };
  for (let pass = 0; pass < 3; pass++) {
    const hits = [], t0 = performance.now(); let n = 0, sum = 0;
    for (;;) { const t = 4 + (performance.now() - t0) / 1000; if (t > 7) break; d.fly(t, 100 + t); await raf(); const g = d.gpu; n++; sum += g; if (g > 14) hits.push([+t.toFixed(2), +g.toFixed(1)]); }
    out.passes.push({ frames: n, avg: +(sum / n).toFixed(2), over14: hits });
  }
  for (let t = 4.8; t < 6.25; t += 0.1) { d.fly(t, 200); for (let i = 0; i < 20; i++) await raf(); let s = 0; for (let i = 0; i < 20; i++) { await raf(); s += d.gpu; } out.steady.push([+t.toFixed(1), +(s / 20).toFixed(2)]); }
  return out;
}
