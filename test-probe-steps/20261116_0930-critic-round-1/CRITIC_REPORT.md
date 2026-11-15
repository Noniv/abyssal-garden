# Blind visual critic, round 1 (2026-11-16)

Input: `renders/` (6 PNG stills, 10 frame triplets + difference images, 65 recording frames). The critic saw no code.
Highest severity: **major**. Gate not passed.

Evidence problems (mine, not the scene):
- A. `diff_tNN.jpg` were solid green (difference taken in YUV): shimmer/aliasing NOT checked this round.
- B. PNG stills reached the critic posterised. Checked: `pose6.png` crop 640x360 has 24,375 distinct colours and is
  smooth, so it was the decode of the 7 MB PNGs. Next round: JPEG q0.97 stills + small PNG crops.

Defects (critic's order):
1. MAJOR fish low-polygon / paper-like near the camera; flight runs into them (second_11, second_08, second_51, seq_t03 right edge: tang flat saturated blue, no haze).
2. MAJOR dashed black-and-white rods reading as a glitch (sea whips): seq_t57 left edge, second_01, second_08 top centre.
3. MAJOR long dark dull stretches, black rock filling the frame (seconds 9-10, 17-19, 41-42, 49-53).
4. MAJOR soft corals faceted and blown out to white (second_10, seq_t39 bottom, seq_t51 lower right, seq_t03, pose6 lower right).
5. MAJOR anemones read as stiff spiky plants in flowerpots; clownfish only specks (pose1 bottom centre, pose4 bottom left, second_11).
6. MAJOR opening/closing section (purple zone) washed out to white-lilac, abrupt palette jump at seconds 3-4 and 58-59.
7. MODERATE rocks: straight polygon edges, smeared texture up close (seq_t51 left, second_53, second_10, seq_t15, pose4 lower right).
8. MODERATE near-camera kelp/foliage flat angular shards (pose1 right third, pose6 right quarter, pose5 right third).
9. MODERATE bubbles too large and uniform (second_53, seq_t03, pose6).
10. MODERATE reef fish patterns like test textures: regular dot grids, crosshatch (pose4 centre and left, pose2).
11. MODERATE sunken ship hard to read, crude details (pose2, seq_t15, seq_t09).
12. MODERATE low-contrast single-hue stills with no focal point (pose3 bait ball same colour as rock; pose5; second_05).
13. MODERATE hard-edged boxy shapes among coral (pose4 right centre; seq_t15 / second_19 left).
14. MINOR manta flat. 15. MINOR performance text burned into last recording frames. 16. MINOR floating boulders plain.

Missing or weak: clownfish (specks), anemones, hunters chasing bait balls (not seen), parrotfish/anthias not identified,
caustics faint on the sea floor, deep-blue distance rare (mostly cyan haze), ship weak, soft corals faceted,
foliage not iridescent. Kelp sway / temporal stability could not be judged (problem A).

Good: kelp-forest mid-distance views with specks and shafts (seq_t27, seq_t33, seq_t21 right half), canyon in seq_t39.

Items 3, 7, 8, 9, 11, 13, 14, 16 are in the original scene too (not introduced by this work), but the gate applies to the whole picture.
