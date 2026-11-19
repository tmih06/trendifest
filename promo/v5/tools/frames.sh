#!/bin/sh
# frames.sh: extracts the stock clips the film uses into 30 fps JPEG sequences (frames/<name>/0001.jpg ...).
# The film seeks frame by frame, so sequences (not <video>) keep every captured frame exact.
# Usage (from promo/v5): sh tools/frames.sh
# name, source (relative to promo/media), start s, length s, width px
set -e
M=../media
x() { mkdir -p frames/$1; rm -f frames/$1/*.jpg; ffmpeg -v error -y -ss $3 -t $4 -i $M/$2 -vf "fps=30,scale=$5:-2:flags=lanczos" -q:v 3 frames/$1/%04d.jpg; echo "$1 $(ls frames/$1 | wc -l)"; }
x night-phone v5/stock/night-phone.mp4 1 6 1920 &
x typing v5/stock/typing.mp4 2 6 1920 &
x waves v5/stock/waves.mp4 0 6 1920 &
x water water.mp4 0 6 1920 &
x dance-street v5/stock/dance-street.mp4 2 8 960 &
x dancer-neon v5/stock/dancer-neon.mp4 3 8 960 &
x headphones v5/stock/headphones.mp4 2 7 960 &
x city-night v5/stock/city-night.mp4 2 7 960 &
x agency-laptop v5/stock/agency-laptop.mp4 2 7 960 &
x phone-scroll phone.mp4 0 7 960 &
wait
