#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-/home/vibecode/workspace/linkedincopilot}"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="/home/vibecode/workspace/linkedincopilot-backup-${STAMP}.zip"

cd "$TARGET_DIR"
zip -r "$OUT" . -x "node_modules/*" ".git/*" "dist/*" ".supabase/*"

echo "Backup created: $OUT"
