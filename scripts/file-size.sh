#!/usr/bin/env bash
# Stops runaway files. An agent adds code where code already is, every addition looks reasonable,
# and nothing fails, so one file reaches 30,000 lines. This fails long before that.
#
#   scripts/file-size.sh             fail if a source file is over the limit, or if a file that was
#                                    already over the limit has grown
#   scripts/file-size.sh --update    freeze today's oversized files at their current length. From
#                                    then on each may shrink and may never grow. (The lead runs this.)
#   scripts/file-size.sh --list      print every oversized file, longest first
#
# Limits: FILE_MAX_LINES (default 600) for source files, twice that for test files.
# Rust: FILE_MAX_LINES_RS (default 1000), counted up to the inline `#[cfg(test)]` module, because
# Rust keeps a type, its impls and its unit tests in one file. Measured on seven large Rust
# projects: 90 to 95% of their files are under 1,000 such lines, and 75 to 90% are under 600.
# Not counted: generated code, vendored code, migrations, fixtures, snapshots, and anything matching
# a regex in .agents/size-exempt (one per line).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
max="${FILE_MAX_LINES:-600}"; max_rs="${FILE_MAX_LINES_RS:-1000}"; base=.agents/size-baseline.tsv; mode="${1:-check}"
src='\.(ts|tsx|js|jsx|mjs|cjs|rs|py|go|java|kt|swift|rb|php|cs|c|cc|cpp|h|hpp|vue|svelte)$'
skip='(^|/)(node_modules|dist|build|target|vendor|\.repos|migrations|fixtures|testdata|__snapshots__|generated)/|\.d\.ts$|\.(gen|generated|pb|min)\.[a-z]+$|_pb2?\.py$'
tests='(\.|_)(test|spec)\.[a-z]+$|(^|/)tests?/|(^|/)test_[^/]+\.py$'

files="$(git ls-files --cached --others --exclude-standard | sort -u | grep -E "$src" | grep -Ev "$skip" || true)"
if [ -f .agents/size-exempt ]; then
  pats="$(grep -Ev '^[[:space:]]*(#|$)' .agents/size-exempt || true)"
  [ -n "$pats" ] && files="$(printf '%s\n' "$files" | grep -Ev -f <(printf '%s\n' "$pats") || true)"
fi

declare -A frozen=()
if [ -f "$base" ]; then while IFS=$'\t' read -r p n; do [ -n "${p:-}" ] && frozen["$p"]="$n"; done < "$base"; fi

over=""; fail=0
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] || continue
  n=$(wc -l < "$f"); lim=$max
  case "$f" in *.rs) lim=$max_rs; n=$(awk '/^[[:space:]]*#\[cfg\(test\)\]/ { exit } { c++ } END { print c + 0 }' "$f") ;; esac
  printf '%s\n' "$f" | grep -qE "$tests" && lim=$((lim * 2))
  [ "$n" -gt "$lim" ] || continue
  over+="$n"$'\t'"$f"$'\n'
  [ "$mode" = check ] || continue
  was="${frozen[$f]:-}"
  if [ -z "$was" ]; then
    echo "size: $f is $n lines; the limit is $lim. Split it by responsibility: move one cohesive part (a type and its functions, one handler, one component) into its own module with a name that says what it is. Do not cut it at line $lim into part files."
    fail=1
  elif [ "$n" -gt "$was" ]; then
    echo "size: $f grew from $was to $n lines. It was already over the limit, so it may only shrink. Put the new code in its own module, or move something out first."
    fail=1
  fi
done <<< "$files"

sorted="$(printf '%s' "$over" | sort -rn)"
case "$mode" in
  --list)   [ -n "$sorted" ] && printf '%s\n' "$sorted" || echo "size: no file is over the limit" ;;
  --update) : > "$base.tmp"
            while IFS=$'\t' read -r n f; do
              [ -n "${f:-}" ] || continue
              was="${frozen[$f]:-}"; keep="$n"
              [ -n "$was" ] && [ "$was" -lt "$n" ] && { keep="$was"; echo "size: $f is $n lines, above its frozen $was. Not raised."; }
              printf '%s\t%s\n' "$f" "$keep" >> "$base.tmp"
            done <<< "$sorted"
            mv "$base.tmp" "$base"; echo "size: froze $(wc -l < "$base" | tr -d ' ') oversized file(s) in $base" ;;
  check)    [ "$fail" -eq 0 ] && echo "size: ok (limit $max lines, $max_rs for Rust; $(printf '%s' "$over" | grep -c . || true) frozen oversized file(s))"; exit "$fail" ;;
  *) echo "usage: scripts/file-size.sh [--update | --list]" >&2; exit 2 ;;
esac
