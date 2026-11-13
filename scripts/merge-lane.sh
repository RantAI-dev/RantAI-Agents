#!/usr/bin/env bash
# Decides who has to say yes to a change when nobody reads the diff.
#
#   lane: auto    green check + green guard + clean first-pass review is enough to merge
#   lane: owner   a person approves, by reading the plan and the evidence in the pull request
#
#   scripts/merge-lane.sh <base-ref> [--max-lines N]      exit 0 = auto, exit 10 = owner
#
# A change goes to the owner when it touches a path in .agents/risky-paths (auth, money, tenancy,
# migrations, deletes, deploy), touches a protected path, removes or skips a test, adds a
# suppression or a dependency, looks like it carries a secret, or is too big to trust in one piece.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
base="${1:?usage: scripts/merge-lane.sh <base-ref> [--max-lines N]}"; shift
max_lines=600
[ "${1:-}" = --max-lines ] && max_lines="${2:?}"

reasons=()
changed="$(git diff --name-only "$base" HEAD)"

if [ -f .agents/risky-paths ]; then
  while IFS= read -r pat; do
    case "$pat" in ''|'#'*) continue ;; esac
    while IFS= read -r f; do [ -n "$f" ] && reasons+=("risky path: $f"); done \
      < <(printf '%s\n' "$changed" | grep -E "$pat" || true)
  done < .agents/risky-paths
fi

while IFS= read -r line; do
  case "$line" in
    "BLOCK "*)                      reasons+=("${line#BLOCK }") ;;
    "WARN  suppression:"*|"WARN  deps:"*|"WARN  size:"*) reasons+=("${line#WARN  }") ;;
  esac
done < <(scripts/guard-diff.sh "$base" --max-lines "$max_lines" 2>/dev/null || true)

if [ "${#reasons[@]}" -eq 0 ]; then
  echo "lane: auto"
  exit 0
fi
echo "lane: owner"
printf '  %s\n' "${reasons[@]}" | sort -u
exit 10
