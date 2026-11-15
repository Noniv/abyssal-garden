// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// Close-up stills of the new fish: each bait ball from 16 m at three moments, the first anthias clouds, and the
// first loner of each mesh kind. Uses the placement lists dev.js exposes (dev.balls, dev.spots).
// Decode with _scratch/decode-captured-dataurls-to-images.mjs (it makes a contact sheet of the "fly*" names only,
// so the shots here are named fly_* to get one).
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, out = { size: d.size, shots: {}, balls: d.balls, ranges: d.fishRanges, spots: d.spots.length };
  const grab = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(canvas.toDataURL('image/jpeg', 0.92))))));
  let n = 0; const shot = async (label, ...a) => { d.look(...a); out.shots['fly_' + String(n++).padStart(2, '0') + '_' + label] = await grab(); };
  const b = d.balls[0];
  if (b) for (const t of [20, 31, 40]) await shot('ball_t' + t, b[0] + 13, b[1] - 3, b[2] + 9, b[0], b[1], b[2], t);
  const first = (k, i = 0) => d.spots.filter((s) => s[0] === k)[i];
  for (const [k, i, dist, label] of [[1, 0, 5, 'anthias'], [1, 5, 3, 'anthias_near'], [2, 0, 5, 'trigger'], [7, 0, 4.5, 'parrot'], [5, 0, 4, 'butterfly'], [6, 0, 4, 'idol']]) {
    const s = first(k, i); if (s) await shot(label, s[1] + dist, s[2] + 0.8, s[3] + dist * 0.6, s[1], s[2], s[3], 20);
  }
  return out;
}
