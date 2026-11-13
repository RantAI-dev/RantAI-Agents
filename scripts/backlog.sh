#!/usr/bin/env bash
# Reads the backlog from the main branch, one row at a time. The repository is the master of the
# list of work: every other board is a copy of this file. Reading is done here, by a script, so no
# model reads a large file, and so nobody reads a stale copy on a working branch.
#
#   scripts/backlog.sh file               which file and which commit is being read
#   scripts/backlog.sh get <ID>           that item's row
#   scripts/backlog.sh ready [N]          up to N (default 30) rows whose status is Todo
#   scripts/backlog.sh has <ID> <STATUS>  exit 0 when that row carries that status word
#
# The backlog is a Markdown table whose first cell is the item's ID. Set BACKLOG_FILE if it is not
# BACKLOG.md, docs/BACKLOG.md or docs/core/BACKLOG.md.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
ref=HEAD
for r in origin/main origin/master main master; do git rev-parse -q --verify "$r" >/dev/null 2>&1 && { ref="$r"; break; }; done
file="${BACKLOG_FILE:-}"
if [ -z "$file" ]; then
  for f in BACKLOG.md docs/BACKLOG.md docs/core/BACKLOG.md; do git cat-file -e "$ref:$f" 2>/dev/null && { file="$f"; break; }; done
fi
[ -n "$file" ] && git cat-file -e "$ref:$file" 2>/dev/null || { echo "backlog: no backlog file on $ref. This project keeps no backlog in the repository." >&2; exit 3; }

row() {  # ID -> the row, cells trimmed
  git show "$ref:$file" | awk -F'|' -v id="$1" '
    /^\|/ { c=$2; gsub(/[`* ]/,"",c); if (c==id) { print; exit } }'
}
case "${1:-}" in
  file) echo "$file at $ref ($(git rev-parse --short "$ref"))" ;;
  get)
    r="$(row "${2:?which ID?}")"; [ -n "$r" ] || { echo "backlog: no row for $2 in $file at $ref" >&2; exit 1; }
    printf '%s\n' "$r" | sed -E 's/[[:space:]]+/ /g' | cut -c1-600 ;;
  has)
    r="$(row "${2:?which ID?}")"; [ -n "$r" ] || exit 1
    printf '%s\n' "$r" | awk -F'|' -v want="${3:?which status?}" '{ for (i=3;i<=NF;i++) { c=$i; gsub(/[`*]/,"",c); gsub(/^ +| +$/,"",c); if (c==want) found=1 } } END { exit found?0:1 }' ;;
  ready)
    git show "$ref:$file" | awk -F'|' -v max="${2:-30}" '
      /^\|/ { todo=0; for (i=3;i<=NF;i++) { c=$i; gsub(/[`*]/,"",c); gsub(/^ +| +$/,"",c); if (c=="Todo") todo=1 }
              if (todo) { n++; if (n<=max) { line=$0; gsub(/[[:space:]]+/," ",line); print substr(line,1,200) } } }
      END { if (n>max) print "... and " n-max " more"; print n+0 " item(s) with status Todo" }' ;;
  *) sed -n '2,13p' scripts/backlog.sh | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
