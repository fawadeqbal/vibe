#!/usr/bin/env bash
# Works out the next app version for a release.
#   BUMP=patch|minor|major (default patch)
# Rules:
#   - the last release is the highest `app-vX.Y.Z` tag;
#   - next = last release bumped by BUMP;
#   - if app/pubspec.yaml says a higher X.Y.Z (you bumped it by hand), that wins;
#   - no release yet → pubspec's version as it is.
# versionCode (Android) = X*1000000 + Y*1000 + Z: always grows with the version
# and is the same however many times the job runs.
# Prints key=value lines (for $GITHUB_OUTPUT).
set -euo pipefail
BUMP="${BUMP:-patch}"
PUBSPEC="${PUBSPEC:-app/pubspec.yaml}"

pub=$(sed -nE 's/^version:[[:space:]]*([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' "$PUBSPEC" | head -1)
[ -n "$pub" ] || { echo "no version: in $PUBSPEC" >&2; exit 1; }

last=$(git tag --list 'app-v*' | sed 's/^app-v//' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1 || true)

ver_gt() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" = "$1" ]; }

if [ -z "$last" ]; then
  next="$pub"
else
  IFS=. read -r X Y Z <<<"$last"
  case "$BUMP" in
    major) next="$((X + 1)).0.0" ;;
    minor) next="$X.$((Y + 1)).0" ;;
    patch) next="$X.$Y.$((Z + 1))" ;;
    *) echo "BUMP must be patch, minor or major (got $BUMP)" >&2; exit 1 ;;
  esac
  if ver_gt "$pub" "$next"; then next="$pub"; fi
fi

IFS=. read -r X Y Z <<<"$next"
if [ "$Y" -gt 999 ] || [ "$Z" -gt 999 ]; then echo "minor and patch must stay under 1000 ($next)" >&2; exit 1; fi
code=$((X * 1000000 + Y * 1000 + Z))
[ "$code" -gt 0 ] || code=1

echo "name=$next"
echo "code=$code"
echo "tag=app-v$next"
echo "prev_tag=${last:+app-v$last}"
