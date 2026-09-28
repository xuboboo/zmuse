#!/bin/bash
# Graphical desktop entrypoint: Xvfb + Xfce4 + x11vnc + noVNC(websockify).
# The container publishes only the noVNC web port; VNC stays internal.
set -eu

export DISPLAY="${DISPLAY:-:1}"
export SCREEN_SIZE="${SCREEN_SIZE:-1600x900x24}"
export VNC_PORT="${VNC_PORT:-5900}"
export NOVNC_PORT="${NOVNC_PORT:-6080}"

rm -rf /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true
Xvfb "$DISPLAY" -screen 0 "$SCREEN_SIZE" -nolisten tcp &
XVFB_PID=$!
for _ in $(seq 1 50); do
  [ -S /tmp/.X11-unix/X1 ] && break
  sleep 0.1
done

# One session bus; startxfce4 reuses it via the exported environment.
eval "$(dbus-launch --sh-syntax --exit-with-session)" 2>/dev/null || true
startxfce4 &
XFCE_PID=$!

x11vnc -display "$DISPLAY" -rfbport "$VNC_PORT" -forever -shared -nopw \
  -noxdamage -repeat -xkb > /tmp/x11vnc.log 2>&1 &
VNC_PID=$!

websockify --web /usr/share/novnc "$NOVNC_PORT" "localhost:$VNC_PORT" \
  > /tmp/websockify.log 2>&1 &
NOVNC_PID=$!

term() {
  kill "$NOVNC_PID" "$VNC_PID" "$XFCE_PID" "$XVFB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap term INT TERM

wait -n "$XVFB_PID" "$XFCE_PID" "$VNC_PID" "$NOVNC_PID"
EXIT=$?
term
exit "$EXIT"
