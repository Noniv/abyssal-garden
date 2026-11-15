// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file, filePath set).
// Viewpoint 3 search: the first bait ball seen from six directions 14 m away (camera slightly above, so the deep
// water is behind the ball), 1.2 s before hunter 0 crosses it. Also the tube sponge / coral look at viewpoint 4.
// The JSON lists the camera offset used for each shot and the terrain size.
async () => {
  const canvas = document.querySelector('canvas'), d = window.dev, F = d.fish, out = { size: d.size, shots: {}, terrain: d.terrain, ball: d.balls[0] };
  const grab = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(canvas.toDataURL('image/jpeg', 0.92))))));
  const per = 2400, first = d.fishRanges[0][0], total = d.fishRanges[0][1], o = (first + total - per * d.balls.length) * 12;
  let tp = (Math.PI / 2 - F[o + 7] * 6.3) / 0.13; while (tp < 12) tp += Math.PI / 0.13;
  const b = d.balls[0]; let n = 0;
  for (const an of [-0.72, 0.3, 1.3, 2.4, 3.5, 4.6]) { // -0.72 rad is the sun's side: looking away from the sun
    const dx = Math.cos(an) * 14, dz = Math.sin(an) * 14;
    d.look(b[0] + dx, b[1] + 2.5, b[2] + dz, b[0], b[1] - 0.5, b[2], tp - 1.2);
    out.shots['fly_' + (n++) + '_ball_from_angle_' + an] = await grab();
  }
  d.pose(4, 20); out.shots['fly_6_pose4'] = await grab();
  d.pose(1, 20); out.shots['fly_7_pose1'] = await grab();
  return out;
}
