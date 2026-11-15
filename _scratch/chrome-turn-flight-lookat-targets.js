// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file).
// Turns where the camera LOOKS at chosen control points of the scripted flight, without moving the path itself
// (positions stay, so the arc-length table and the world generator's keep-clear zones stay valid).
// TURNS: [control point index, degrees to the right (negative = left), metres to raise the look-at target].
// It always starts again from the original look-at values (kept in window.flyOriginal), so edit TURNS and re-run.
// Returns the resulting FLY array as text, ready to paste into main.js.
() => {
  const F = window.dev.FLY; window.flyOriginal ||= Array.from(F); F.set(window.flyOriginal);
  const TURNS = [[2, 14, 0], [3, 30, 1], [4, 14, 3], [7, 20, 1], [8, 26, 0], [15, 26, 1], [16, 10, 0], [18, 40, 2], [19, 22, 1]];
  for (const [i, deg, up] of TURNS) {
    const o = i * 6, dx = F[o + 3] - F[o], dz = F[o + 5] - F[o + 2], yaw = Math.atan2(dx, -dz), a = deg * Math.PI / 180;
    // "right" for this heading is (cos yaw, sin yaw); rotate the horizontal look vector toward it
    const l = Math.hypot(dx, dz), rx = Math.cos(yaw) * l, rz = Math.sin(yaw) * l;
    F[o + 3] = F[o] + dx * Math.cos(a) + rx * Math.sin(a); F[o + 5] = F[o + 2] + dz * Math.cos(a) + rz * Math.sin(a); F[o + 4] += up;
  }
  const rows = []; for (let i = 0; i < F.length; i += 6) rows.push('  ' + Array.from(F.subarray(i, i + 6)).map((v) => +v.toFixed(1)).join(', ') + ',');
  return rows.join('\n');
}
