#!/bin/sh
# Align the runtime user with the host's PUID/PGID (default 1000:1000),
# give it /data, then drop privileges. Library mounts are read-only and
# never touched.
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -u)" = "0" ]; then
  CURRENT_GID="$(getent group zenport | cut -d: -f3)"
  CURRENT_UID="$(getent passwd zenport | cut -d: -f3)"
  if [ "$CURRENT_GID" != "$PGID" ]; then
    groupmod -o -g "$PGID" zenport
  fi
  if [ "$CURRENT_UID" != "$PUID" ] || [ "$CURRENT_GID" != "$PGID" ]; then
    usermod -o -u "$PUID" -g "$PGID" zenport
  fi
  d="${ZP_DATA_DIR:-/data}"
  if [ -d "$d" ]; then
    chown -h "$PUID:$PGID" "$d" 2>/dev/null || true
    find "$d" -maxdepth 2 ! -type l ! -user "$PUID" -exec chown -h "$PUID:$PGID" {} + 2>/dev/null || true
  fi
  exec gosu "$PUID:$PGID" "$@"
fi

exec "$@"
