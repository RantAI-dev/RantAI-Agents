#!/usr/bin/env bash
# Lets an existing codebase adopt a rule without fixing everything first. Each metric is a command
# that prints a whole number. The number may go down. It may never go up.
#
#   scripts/ratchet.sh            compare with .agents/ratchet.lock; fail if any metric rose
#   scripts/ratchet.sh --update   lower the lock to today's numbers (the lead runs this when merging)
#   scripts/ratchet.sh --reset    write today's numbers even if higher (the owner's decision)
#
# Metrics live in .agents/ratchet.tsv, one per line:  name<TAB>command
# When a metric reaches zero, turn it into a lint rule or a test and delete the line.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
conf=.agents/ratchet.tsv; lock=.agents/ratchet.lock
mode="${1:-check}"
[ -f "$conf" ] || { echo "ratchet: no $conf"; exit 0; }

declare -A base=()
if [ -f "$lock" ]; then
  while IFS=$'\t' read -r name count; do
    [ -n "${name:-}" ] && base["$name"]="$count"
  done < "$lock"
fi

fail=0; out=""; seen=0
while IFS=$'\t' read -r name cmd; do
  case "${name:-}" in ''|'#'*) continue ;; esac
  seen=$((seen + 1))
  now="$(bash -c "$cmd" 2>/dev/null | tr -dc '0-9')"; now="${now:-0}"
  was="${base[$name]:-}"
  case "$mode" in
    --reset) keep="$now" ;;
    --update) if [ -z "$was" ] || [ "$now" -lt "$was" ]; then keep="$now"; else keep="$was"; fi
              [ -n "$was" ] && [ "$now" -gt "$was" ] && { echo "ratchet: $name is $now, above the lock ($was). Not raised; fix it or ask the owner for --reset."; fail=1; } ;;
    *) keep="${was:-$now}"
       if [ -z "$was" ]; then echo "ratchet: $name has no baseline ($now now). Run scripts/ratchet.sh --update."; fail=1
       elif [ "$now" -gt "$was" ]; then echo "ratchet: $name rose from $was to $now. Remove what you added; the baseline is not yours to raise."; fail=1
       elif [ "$now" -lt "$was" ]; then echo "ratchet: $name improved, $was -> $now"
       fi ;;
  esac
  out+="$name"$'\t'"$keep"$'\n'
done < "$conf"

[ "$seen" -eq 0 ] && { echo "ratchet: no metrics configured"; exit 0; }
if [ "$mode" != check ]; then printf '%s' "$out" > "$lock"; echo "ratchet: wrote $lock ($seen metrics)"; fi
[ "$fail" -eq 0 ] && [ "$mode" = check ] && echo "ratchet: ok ($seen metrics)"
exit "$fail"
