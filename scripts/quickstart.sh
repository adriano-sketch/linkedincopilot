#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/vibecode/workspace/linkedincopilot"

if [ ! -f "$ROOT_DIR/package.json" ]; then
  echo "Expected $ROOT_DIR/package.json. Aborting." >&2
  exit 1
fi

"$ROOT_DIR/scripts/backup.sh" "$ROOT_DIR"

rsync -a --delete "$ROOT_DIR/chrome-extension/" "$ROOT_DIR/public/chrome-extension/"

echo "\nQuickstart done. Next steps (run manually):"
echo "1) npx supabase db push"
echo "2) npx supabase functions deploy action-completed"
echo "3) npm install (if needed)"
echo "4) npm run dev"
