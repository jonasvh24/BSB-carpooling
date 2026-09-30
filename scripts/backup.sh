#!/usr/bin/env bash
# Nightly copy of the SQLite database. Run by hand or from cron/launchd:
#   0 3 * * * cd /path/to/jvcarpool && bash scripts/backup.sh
# Uses the SQLite backup API when sqlite3 is available (safe while the app runs),
# otherwise a plain copy. Keeps the last 30 files.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DATABASE_FILE:-prisma/dev.db}"
OUT="${BACKUP_DIR:-backups}"
mkdir -p "$OUT"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$OUT/dev-$STAMP.db"
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$TARGET'"
else
  cp "$DB" "$TARGET"
fi
ls -1t "$OUT"/dev-*.db 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "backup written to $TARGET"
