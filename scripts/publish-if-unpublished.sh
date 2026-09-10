#!/usr/bin/env bash
set -euo pipefail

unpublished=$(node scripts/tag-released-packages.mjs --dry-run --json --unpublished --captured /tmp/captured.json)
if [ "$unpublished" = "[]" ]; then
  echo "every captured version is already on npm — tagging only"
  exit 0
fi

exec pnpm publish -r --provenance --access public --no-git-checks
