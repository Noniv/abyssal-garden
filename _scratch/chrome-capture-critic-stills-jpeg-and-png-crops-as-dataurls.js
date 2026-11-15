// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// The visual critic's six fixed viewpoints: full 2560x1440 frames as JPEG quality 0.97 (large PNGs reached the critic
// posterised), plus for each a lossless 960x540 PNG crop of the upper-centre water at native pixels, for judging
// banding. Scene clock held at 20 s, except viewpoint 3 (bait ball): 1.4 s before hunter 0 crosses the ball, worked
// out with the hunter() formula from the fish shader.
// Decode with _scratch/decode-captured-dataurls-to-images.mjs.
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, F = d.fish, out = { size: d.size, shots: {}, times: {} };
  const crop = document.createElement('canvas'); crop.width = 960; crop.height = 540; const c2 = crop.getContext('2d');
  const grab = (name) => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    out.shots[name] = canvas.toDataURL('image/jpeg', 0.97);
    c2.drawImage(canvas, 800, 90, 960, 540, 0, 0, 960, 540); out.shots[name + '_crop_native_pixels'] = crop.toDataURL('image/png');
    res();
  }))));
  const per = 2400, first = d.fishRanges[0][0], total = d.fishRanges[0][1], o = (first + total - per * d.balls.length) * 12;
  let tp = (Math.PI / 2 - F[o + 7] * 6.3) / 0.13; while (tp < 12) tp += Math.PI / 0.13;
  for (let n = 1; n <= 6; n++) { const t = n === 3 ? tp - 0.6 : 20; out.times['pose' + n] = +t.toFixed(2); d.pose(n, t); await grab('pose' + n); }
  return out;
}
