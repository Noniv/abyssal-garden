// Runs inside dev.html through the chrome-devtools evaluate_script tool (sourcePath = this file).
// Starts the 60 s benchmark flight (resolution pinned to 2560x1440 by dev.js) and resolves with the
// result JSON: average / 99th percentile / max for frame time and GPU time, plus the list of slow frames.
// Needs: viewport emulated at 2560x1440x1, page built with `npm run build:dev`.
async () => {
  window.dev.bench();
  for (let i = 0; i < 150 && !window.dev.result; i++) await new Promise((r) => setTimeout(r, 500));
  return window.dev.result || { error: 'benchmark did not finish in 75 s', visible: document.visibilityState };
}
