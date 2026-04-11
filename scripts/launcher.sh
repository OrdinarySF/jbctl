#!/bin/sh
# Runtime-agnostic launcher for jbctl.
# Prefers bun, falls back to node.

# Resolve symlinks (npm/bun global install creates symlinks to this file)
SELF="$0"
if [ -L "$SELF" ]; then
  TARGET="$(readlink "$SELF")"
  case "$TARGET" in
    /*) SELF="$TARGET" ;;
    *)  SELF="$(dirname "$SELF")/$TARGET" ;;
  esac
fi
DIR="$(cd "$(dirname "$SELF")" && pwd)"

if command -v bun >/dev/null 2>&1; then
  exec bun "$DIR/cli.js" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node "$DIR/cli.js" "$@"
else
  echo "jbctl requires bun or node (>=18)" >&2
  exit 1
fi
