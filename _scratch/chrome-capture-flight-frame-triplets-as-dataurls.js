// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// For the visual critic's motion check: at ten moments of the scripted flight, three consecutive frames (camera held still, scene clock advancing) 1/60 s
// apart (camera and scene clock both advance), as JPEG quality 0.95 at the canvas's real size. Shimmer, crawling
// edges and popping show up as differences between neighbours.
// Decode with _scratch/decode-captured-dataurls-to-images.mjs, then _scratch/make-frame-difference-images.sh.
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, out = { size: d.size, shots: {} };
  const grab = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(canvas.toDataURL('image/jpeg', 0.95))))));
  for (const t of [3, 9, 15, 21, 27, 33, 39, 45, 51, 57]) for (let k = 0; k < 3; k++) { d.fly(t, t + k / 60); out.shots['seq_t' + String(t).padStart(2, '0') + '_frame' + k] = await grab(); }
  return out;
}
