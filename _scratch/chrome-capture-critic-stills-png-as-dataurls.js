// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// The visual critic's six fixed viewpoints as lossless PNG at the canvas's real size (2560x1440 with the emulated
// viewport). Scene clock held at 20 s, except viewpoint 3 (bait ball) at 25.4 s, when a hunter is closing in.
// Decode with _scratch/decode-captured-dataurls-to-images.mjs.
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, out = { size: d.size, shots: {} };
  const grab = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(canvas.toDataURL('image/png'))))));
  for (let n = 1; n <= 6; n++) { d.pose(n, n === 3 ? 25.4 : 20); out.shots['pose' + n] = await grab(); }
  return out;
}
