#!/bin/bash
# Usage: make-frame-difference-images.sh <directory with seq_tNN_frame0.jpg / frame1.jpg ...>
# For each flight moment writes diff_tNN.jpg: the absolute difference between frame 0 and frame 1, amplified 6x.
# Smooth camera motion gives soft, even edges; shimmer and popping give bright speckle or isolated bright shapes.
set -eu
dir="$1"
for f0 in "$dir"/seq_t*_frame0.jpg; do
  f1="${f0/_frame0/_frame1}"; t="$(basename "$f0" | sed 's/seq_\(t[0-9]*\)_frame0.jpg/\1/')"
  ffmpeg -y -loglevel error -i "$f0" -i "$f1" -filter_complex "[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]blend=all_mode=difference,lutrgb=r='min(val*6,255)':g='min(val*6,255)':b='min(val*6,255)'" -q:v 3 "$dir/diff_$t.jpg"
done
echo "wrote $(ls "$dir"/diff_t*.jpg | wc -l | tr -d ' ') difference images"
