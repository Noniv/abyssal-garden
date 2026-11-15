# Blind visual critic, round 2 (2026-11-16)

Fresh critic, no knowledge of round 1. Input: `renders/` (6 JPEG q97 stills + 6 lossless crops, 10 triplets + diffs, 65 recording frames).
Highest severity: **major** (no blockers). Gate not passed. No file reached the critic corrupted. Banding: none found.

Evidence problems (mine): flight moves 20-30 px per 1/60 s near objects, so diffs cannot separate shimmer from motion;
recording had ~4 s before the flight started (read as a colour jump, item 13).

1. MAJOR long murky near-black stretches (seconds 49-54, 10; left of seq_t39/45/51; pose6 lower left).
2. MAJOR washed-out low-contrast views (pose3 whole frame; seconds 55-57).
3. MAJOR rock silhouettes visibly polygonal (seq_t51 left, second_10, second_53, seq_t15 overhang).
4. MAJOR near kelp/foliage flat faceted paper cut-outs (pose6 right third, pose1 right third, seq_t09, pose6 black column).
5. MAJOR blocky corals and sponges (pose4 pink slabs and tube cluster, second_16, seq_t15).
6. MODERATE manta flat and odd (pose1, pose2).
7. MODERATE ship a featureless silhouette (pose2, seq_t09).
8. MODERATE surface from below looks like flat blotches (pose3 crop, pose6 top centre).
9. MODERATE near fish stiff and flat (pose3 hunters with orange card fins, second_50 school, pose4 mint fish).
10. MODERATE ruler-straight horizontal edge in distant haze (pose5 left 250-450,640-700; seq_t27).
11. MODERATE anemone weak up close (second_11; seq_t03 base zig-zag rim).
12. MODERATE stepped ground terraces, hard unexplained ground shadows (seq_t57, seq_t39).
13. MODERATE abrupt colour jumps at recording start/end (recording artefact, see above).
14-17 MINOR: stretched ground texture (pose4), over-bright pale sponges (pose6, seq_t51), stray lilac shard (seq_t09), floating boulders flat dark.

Missing/weak: parrotfish and anthias not identifiable; hunters not recognised as chasing; arches rare; caustics sparse on seabed;
foliage not iridescent; bubbles sparse; ship, manta, anemone close-up, near kelp weak.

Compared with round 1: all six round-1 majors about the NEW content (fish, sea whips, soft corals, anemones, purple
white-out) are now moderate, minor or absent. Remaining majors 1, 3, 4, 5 are in the original scene; 2 is the new viewpoint 3.
