// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// Views of the water surface from below, to judge the waves: grazing just under the surface, a mid angle,
// straight up from 6 m and 20 m, and the sun's direction from 12 m. Scene clock held at 20 s.
// Decode with _scratch/decode-captured-dataurls-to-images.mjs.
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, out = { size: d.size, shots: {} };
  const grab = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(canvas.toDataURL('image/jpeg', 0.92))))));
  let n = 0; const shot = async (label, ...a) => { d.look(...a); out.shots['fly_' + String(n++) + '_' + label] = await grab(); };
  await shot('grazing_2m', -2, -2.5, 24, 38.0, -1.2, -6.0, 20);
  await shot('mid_angle_6m', -2, -6, 24, 18.0, 0, 4.0, 20);
  await shot('straight_up_6m', -2, -6, 24, -1.5, 0, 23.5, 20);
  await shot('straight_up_20m', -2, -20, 24, -1.5, 0, 23.5, 20);
  await shot('toward_sun_12m', -2, -12, 24, 1.2, 0, 21.1, 20);
  await shot('horizon_10m', -2, -10, 24, 58.0, -6, -16.0, 20);
  return out;
}
