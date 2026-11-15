# Renders for visual review

All images come from one real-time 3D scene rendered in a web browser at 2560x1440.

- `pose1.jpg` ... `pose6.jpg`: six fixed camera viewpoints, full resolution, JPEG quality 97.
- `poseN_crop_native_pixels.png`: a lossless 960x540 crop of the same frame (the region starting 800 px from the left, 90 px from the top) at native pixels. Use these to judge banding in water gradients.
- `seq_tNN_frameK.jpg`: at ten moments (NN = seconds into a 60-second scripted camera flight), three
  consecutive frames (K = 0, 1, 2) taken 1/60 second apart, full resolution, high-quality JPEG.
- `diff_tNN.jpg`: absolute difference between frame 0 and frame 1 of that moment, amplified 6x.
  Smooth camera motion gives soft, even outlines. Shimmer, crawling edges or popping give bright speckle
  or isolated bright shapes.
- `recording/second_NN.jpg`: one frame per second from a real-time screen recording of the whole flight,
  scaled to 1280x720 and video-compressed (so fine detail and gradients in these are less reliable than
  in the files above; use them for continuity, popping and composition over time).
- `recording_one_frame_per_second_sheet.jpg`: the same frames as one contact sheet.

## What the scene is meant to be

A beautiful fantasy underwater scene to fly a free camera through:

- Dense, towering kelp columns with sparkling green/gold specks, swaying
- Soft corals; anemones (with clownfish)
- Schools of smaller fish, bait balls with larger fish occasionally chasing; reef fish such as anthias,
  triggerfish, butterflyfish, parrotfish (stylised, fantasy colouring with some glow is intended)
- Strong depth fog/absorption: turquoise-cyan near the surface going to deep blue in the distance
- God rays, animated caustics, wavy surface visible from below
- Rock canyons, arches and overhangs; floating boulders
- Iridescent purple/pink foliage, magenta ground cover, barrel sponges, coral
- Manta rays, rising bubbles, drifting particles
- Set pieces: a sunken ship hull, a stone whale-fluke sculpture
