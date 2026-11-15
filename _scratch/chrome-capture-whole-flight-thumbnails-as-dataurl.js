// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// One 640x360 thumbnail per second of the scripted flight (t = 0.5, 1.5, ... 59.5), drawn into a single 8x8 contact
// sheet in the page, returned as one JPEG. Also returns, per second, the spline parameter (which control points the
// camera is between) and the camera position, for tuning the path. Decode with decode-captured-dataurls-to-images.mjs.
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, sheet = document.createElement('canvas'); sheet.width = 640 * 8; sheet.height = 360 * 8;
  const c2 = sheet.getContext('2d'), frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res))));
  const info = [];
  for (let s = 0; s < 60; s++) {
    const t = s + 0.5; d.fly(t); await frame();
    c2.drawImage(canvas, (s % 8) * 640, Math.floor(s / 8) * 360, 640, 360);
    c2.fillStyle = '#fff'; c2.font = '28px sans-serif'; c2.fillText(String(t), (s % 8) * 640 + 10, Math.floor(s / 8) * 360 + 34);
    info.push(d.at(t).map((v) => +v.toFixed(2)));
  }
  return { size: d.size, shots: { pose_whole_flight_sheet: sheet.toDataURL('image/jpeg', 0.85) }, info };
}
