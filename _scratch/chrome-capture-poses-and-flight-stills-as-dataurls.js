// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, with
// filePath set so the large JSON goes to disk instead of the conversation).
// Captures the six fixed viewpoints (scene clock held at 20 s) and seven positions along the scripted
// flight, straight from the WebGPU canvas at its real resolution (2560x1440 with the emulated viewport).
// JPEG quality 0.95 keeps the JSON small enough for quick look-checks; use take_screenshot (PNG) for the
// final critic set. Decode with _scratch/decode-captured-dataurls-to-images.mjs.
async () => {
  const canvas = document.querySelector('canvas'), out = { size: window.dev.size, shots: {} };
  // a requestAnimationFrame callback registered now runs after the page's own frame() in the same frame,
  // while the canvas still holds the picture that was just drawn
  const grab = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(canvas.toDataURL('image/jpeg', 0.95))))));
  for (let n = 1; n <= 6; n++) { window.dev.pose(n, 20); out.shots['pose' + n] = await grab(); }
  for (const t of [6, 14, 22, 30, 38, 46, 54]) { window.dev.fly(t); out.shots['fly' + String(t).padStart(2, '0')] = await grab(); }
  return out;
}
