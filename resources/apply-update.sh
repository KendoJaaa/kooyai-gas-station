#!/bin/bash
PENDING="$1"
TARGET="$2"
MARKER="$3"
RELAUNCH="$4"
EXE="$5"
sleep 2
while pgrep -x Kooyai >/dev/null; do
  sleep 1
done
if cp "$PENDING" "$TARGET"; then
  rm -f "$PENDING" "$MARKER"
fi
if [ "$RELAUNCH" = "1" ]; then
  APP="$(cd "$(dirname "$EXE")/../.." && pwd)"
  open "$APP"
fi
