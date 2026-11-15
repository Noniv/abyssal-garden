# Performance report, final build (2026-11-16)

Machine: Apple M5 Max, macOS 27.2.1, Chrome 157.0.8103.79, WebGPU adapter apple / metal-3 (not fallback), mains power,
built-in 120 Hz display. NOT a quiet machine: other apps were drawing throughout (including the Claude session doing this work).
Method: `dev.html` (same code as `index.html` plus dev tools), viewport 2560x1440 at device pixel ratio 1, detail High,
resolution pinned, dynamic resolution frozen, draw distance scale 1. `window.dev.bench()` flies the scripted 60 s path.
GPU time = WebGPU timestamp queries (start of the water pass to end of the composite). Frame time = requestAnimationFrame delta.
Raw JSON: `bench-final-run-1.json`, `bench-final-run-2.json` (this folder).

## Final build

| Run | GPU avg | GPU p99 | GPU max | GPU > 16.7 ms | Frame avg | Frame p99 | Frame max | Frames >= 20 ms | Frames |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 8.53 | 12.26 | 48.82 | 2 | 9.50 | 17.10 | 83.40 | see note | 6319 |
| 2 | 8.90 | 12.32 | 42.21 | 3 | 9.85 | 17.20 | 58.30 | see note | 6089 |

Note: the slow-frame list in the JSON holds the first 200 slow frames only, and most of those are 16.7 ms frames
(one missed 120 Hz refresh), so it does not reach the later spikes; the max values above come from the full log.

- Gate "GPU frame time <= 11 ms average": **PASS** (8.5-8.9 ms).
- Gate "no frame > 16.7 ms": **NOT reliably met.** Each of these runs has 2-3 isolated GPU spikes of 39-49 ms and a worst
  frame of 58-83 ms.

## The spikes: what is and is not known

| Build | GPU avg | GPU max | GPU > 16.7 | spike positions in the flight |
|---|---|---|---|---|
| Original scene, 3 runs | 6.68 / 8.11 / 8.60 | 38.7 / 48.5 / 36.2 | 3 / 87 (first flight after load) / 1 | varied |
| All new life | 7.31 | 35.3 | 7 | 4.3, 10.4, 29.5, 53.8, 59.5 s |
| + first-frame warm-up | 6.99 / 7.12 | 35.7 / 38.8 | 3 / 3 | 5.5, 13.5, 48.7 / 36.1, 41.6 s |
| + 4x seabed etc. | 9.06 | 31.2 | 2 | 5.6 s |
| + coarse seabed beyond 60 m | 8.70 | 30.7 | 1 | 5.5 s |
| + lamp (round 4) | 8.28 | **11.73** | **0** | none: a completely clean flight |
| + flight re-aimed (round 5) | 7.84 | 34.5 | 2 | 5.4 s |
| Final | 8.53 / 8.90 | 48.8 / 42.2 | 2 / 3 | 17.2 / 18.2 s (plus later ones) |

- Fixed: spikes that recurred at the same flight times on the first flight after each page load (first use of instance
  buffers and level-of-detail variants). The first frame, hidden behind the loading screen, now draws everything once.
- Not explained: 1-3 isolated single-frame spikes per flight at positions that move between runs. Replaying flight seconds
  4-7 three times gave no spike; holding the camera still for 3 x 12 s gave no GPU spike (one 31 ms frame with GPU at
  8.4 ms, i.e. a stall outside the renderer). The untouched original scene shows the same 1-3 per flight on this machine.
  One flight of the last seven was clean. Most likely other GPU clients on the machine, but that is not proven.
  To settle it: run `dev.html?bench=1` with every other app closed.
- Frame time on a 120 Hz display: a frame whose work exceeds 8.33 ms is shown one refresh late (16.67 ms plus timer jitter),
  which is why hundreds of frames read 16.7-17.6 ms; none of those is below 60 frames per second.

## Cost of the new work (GPU average, same flight)

Original 6.7-8.6 ms -> final 8.5-8.9 ms. The new life itself (about 14,000 fish in 8 shapes, 70 anemones, soft corals, sea
whips, polyp carpets) was within run-to-run noise. The measurable cost came from the critic-driven quality changes: seabed
four times finer within 60 m, corals at full detail out to 22 m, 13-row kelp blades within 9 m.

## Allocations

Nothing in the new content runs on the processor per frame: fish, tentacles and soft corals are placed by vertex shaders from
the scene clock. `performance.memory.usedJSHeapSize` sampled every 5 s through a flight read 376,953 KB twelve times in a row.
Chrome rounds that figure, so this shows no steady growth, not a literal zero. Per-frame WebGPU objects (command encoder,
pass encoders, swap-chain view) are created as in the original.

## Size

`index.html`: 120,057 bytes minified (47,821 bytes gzipped). Original: 99,514 bytes.
