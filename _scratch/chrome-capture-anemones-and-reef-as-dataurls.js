// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// Stills of the step 3 content: the first few anemones (with clownfish) from 2.5 m and 5 m, the six fixed
// viewpoints, and counts of what was placed. Decode with _scratch/decode-captured-dataurls-to-images.mjs.
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, out = { size: d.size, shots: {}, anemones: d.anemones.length, ranges: d.fishRanges };
  const grab = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(canvas.toDataURL('image/jpeg', 0.92))))));
  let n = 0; const shot = async (label, ...a) => { d.look(...a); out.shots['fly_' + String(n++).padStart(2, '0') + '_' + label] = await grab(); };
  const A = d.anemones;
  for (const [i, dist] of [[0, 2.5], [0, 5], [9, 2.5], [20, 3], [33, 5], [A.length - 1, 3], [A.length - 3, 2.2], [A.length - 6, 4]]) { const a = A[i]; if (a) await shot('anemone' + i, a[0] + dist * 0.8, a[1] + dist * 0.35, a[2] + dist * 0.6, a[0], a[1] - 0.2, a[2], 20); }
  for (let p = 1; p <= 6; p++) { d.pose(p, 20); out.shots['pose' + p] = await grab(); }
  return out;
}
