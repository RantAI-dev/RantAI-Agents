#!/usr/bin/env bash
# Optional. Copies an item's status from the repository to the Lark base. The repository is the
# master of everything: this script refuses to write a status that the backlog on the main branch
# does not already show. A project with no Lark base does not set LARK_BASE_TOKEN, and nothing
# calls this.
#
#   scripts/tracker-lark.sh set <BACKLOG-ID> [--status S] [--pr URL] [--note TEXT] [--blocked-reason TEXT] [--yes]
#   scripts/tracker-lark.sh feature <BACKLOG-ID> [--status S] [--evidence TEXT] [--yes]
#   scripts/tracker-lark.sh get <BACKLOG-ID | rec...>     the Lark row, a few lines, to compare
#   scripts/tracker-lark.sh ready                         Todo tasks in Lark, to spot ones the repository lacks
#
# `set` and `feature` print what they would write and stop. Add --yes to write.
# An agent may set a task to: In Progress, In Review, Blocked, Done. A feature to: Building,
# In Acceptance. Every other status, and every people field, belongs to a person.
#
# Configuration, in .env (never committed) or the environment:
#   LARK_BASE_TOKEN   the base                         required
#   LARK_PRODUCT      this repository's row in the Products table, by name     one of these two
#   LARK_PROJECT      or its row in the Projects table, by name
#   LARK_AS           user (default) or bot
# Needs lark-cli, logged in, and python3.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
if [ -f "$root/.env" ]; then
  while IFS='=' read -r k v; do
    case "$k" in LARK_BASE_TOKEN|LARK_PRODUCT|LARK_PROJECT|LARK_AS) [ -z "${!k:-}" ] && export "$k=${v%\"}" && export "$k=${!k#\"}" ;; esac
  done < <(grep -E '^LARK_[A-Z_]+=' "$root/.env" || true)
fi
: "${LARK_BASE_TOKEN:?LARK_BASE_TOKEN is not set. This project has no Lark base configured; skip the tracker step.}"
# Repository first. Before anything is sent to Lark, the backlog on the main branch must already
# carry the status being copied.
if [ "${1:-}" = set ] || [ "${1:-}" = feature ]; then
  key="${2:-}"; want=""; prev=""
  for a in "$@"; do [ "$prev" = --status ] && want="$a"; prev="$a"; done
  case "$key" in rec*) echo "A row with no Backlog ID is not in the repository yet. Add it to the backlog through a pull request first; Lark only mirrors." >&2; exit 4 ;; esac
  if [ -n "$want" ]; then
    "$root/scripts/backlog.sh" has "$key" "$want" || {
      echo "The backlog on the main branch does not show '$want' for $key. Change the backlog through a pull request first; Lark only mirrors what the repository says." >&2
      exit 4; }
  fi
fi
command -v lark-cli >/dev/null || { echo "lark-cli is not installed" >&2; exit 2; }
export LARKSUITE_CLI_NO_UPDATE_NOTIFIER=1 LARKSUITE_CLI_NO_SKILLS_NOTIFIER=1
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT; cd "$work"
as="${LARK_AS:-user}"

read_table() {  # table, filter-json, fields... -> ./rows.ndjson
  local table="$1" filter="$2"; shift 2
  local args=(); for f in "$@"; do args+=(--field-id "$f"); done
  lark-cli base +record-list --base-token "$LARK_BASE_TOKEN" --table-id "$table" --filter-json "$filter" \
    "${args[@]}" --format ndjson --output ./rows.ndjson --overwrite --as "$as" >/dev/null
}
row_id_by_name() {  # table, name field, name -> record id
  read_table "$1" "{\"logic\":\"and\",\"conditions\":[[\"$2\",\"intersects\",$(python3 -I -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$3")]]}" "$2"
  python3 -I -c '
import json,sys
want=sys.argv[2].strip().lower()
for l in open("rows.ndjson"):
    d=json.loads(l)
    if str(d.get(sys.argv[1]) or "").strip().lower()==want: print(d["record_id"]); break' "$2" "$3"
}
scope=""
if [ -n "${LARK_PRODUCT:-}" ]; then
  id="$(row_id_by_name Products Product "$LARK_PRODUCT")"; [ -n "$id" ] || { echo "no product named '$LARK_PRODUCT' in the base" >&2; exit 2; }
  scope=",[\"Product\",\"intersects\",[{\"id\":\"$id\"}]]"
elif [ -n "${LARK_PROJECT:-}" ]; then
  id="$(row_id_by_name Projects Project "$LARK_PROJECT")"; [ -n "$id" ] || { echo "no project named '$LARK_PROJECT' in the base" >&2; exit 2; }
  scope=",[\"Project\",\"intersects\",[{\"id\":\"$id\"}]]"
fi

find_row() {  # table, id -> ./row.json (one record) ; fields follow
  local table="$1" key="$2"; shift 2
  if [[ "$key" == rec* ]]; then
    read_table "$table" "{\"logic\":\"and\",\"conditions\":[${scope#,}]}" "Backlog ID" "$@"
    python3 -I -c '
import json,sys
hits=[d for d in map(json.loads,open("rows.ndjson")) if d.get("record_id")==sys.argv[1]]
if len(hits)!=1: sys.exit("no row with record id %s in this product or project"%sys.argv[1])
json.dump(hits[0],open("row.json","w"))' "$key"
  else
    read_table "$table" "{\"logic\":\"and\",\"conditions\":[[\"Backlog ID\",\"intersects\",\"$key\"]$scope]}" "Backlog ID" "$@"
    python3 -I -c '
import json,sys
hits=[d for d in map(json.loads,open("rows.ndjson")) if (d.get("Backlog ID") or "").strip()==sys.argv[1]]
if len(hits)!=1: sys.exit("%d rows have Backlog ID %s (set LARK_PRODUCT or LARK_PROJECT, or use the record id)"%(len(hits),sys.argv[1]))
json.dump(hits[0],open("row.json","w"))' "$key"
  fi
}
write_row() {  # table, yes-flag ; reads ./update.json {record_id:{fields}}
  if [ "$2" != yes ]; then echo "would write to $1 (add --yes to write):"; cat update.json; echo; return 0; fi
  lark-cli base +record-batch-update --base-token "$LARK_BASE_TOKEN" --table-id "$1" --json "{\"update_records\":$(cat update.json)}" --as "$as" > out.json \
    && python3 -I -c 'import json;d=json.load(open("out.json"));print("written" if d.get("ok",True) and not d.get("error") else "FAILED: "+json.dumps(d.get("error",d))[:300])'
}

cmd="${1:-}"; shift || true
case "$cmd" in
  ready)
    read_table Tasks "{\"logic\":\"and\",\"conditions\":[[\"Status\",\"intersects\",[\"Todo\"]]$scope]}" "Backlog ID" Task Priority Type "Blocked by (tasks)" "Blocked by (features)"
    python3 -I -c '
import json
rows=[json.loads(l) for l in open("rows.ndjson")]
one=lambda v:(v or [""])[0] if isinstance(v,list) else (v or "")
rows.sort(key=lambda d:(one(d.get("Priority")) or "P9", d.get("Backlog ID") or "~"))
for d in rows[:30]:
    blockers=len(d.get("Blocked by (tasks)") or [])+len(d.get("Blocked by (features)") or [])
    title=" ".join(str(d.get("Task") or "").split()[:12])
    print("%s | %s | %s | %s | blocked by: %d"%(d.get("Backlog ID") or d["record_id"], one(d.get("Priority"))[:2] or "--", one(d.get("Type")) or "--", title, blockers))
if len(rows)>30: print("... and %d more Todo tasks"%(len(rows)-30))
print("%d Todo task(s). A task with blockers is not ready until each blocker is Done."%len(rows))' ;;
  get)
    find_row Tasks "${1:?which task?}" Task Status Priority Type PR Notes "Blocked Reason" "Blocked by (tasks)" Feature
    python3 -I -c '
import json
d=json.load(open("row.json")); one=lambda v:(v or [""])[0] if isinstance(v,list) and (not v or not isinstance(v[0],dict)) else v
for k in ("Backlog ID","record_id","Task","Status","Priority","Type","PR","Blocked Reason","Notes"):
    v=one(d.get(k)); print("%s: %s"%(k, " ".join(str(v if v is not None else "").split())[:300]))
print("blocked by tasks:", len(d.get("Blocked by (tasks)") or []), "| feature rows:", len(d.get("Feature") or []))' ;;
  set|feature)
    key="${1:?which row?}"; shift
    status=""; pr=""; note=""; reason=""; evidence=""; yes=no
    while [ $# -gt 0 ]; do case "$1" in
      --status) status="$2"; shift 2 ;; --pr) pr="$2"; shift 2 ;; --note) note="$2"; shift 2 ;;
      --blocked-reason) reason="$2"; shift 2 ;; --evidence) evidence="$2"; shift 2 ;; --yes) yes=yes; shift ;;
      *) echo "unknown argument: $1" >&2; exit 2 ;; esac; done
    if [ "$cmd" = set ]; then table=Tasks; allowed="In Progress|In Review|Blocked|Done"; else table=Features; allowed="Building|In Acceptance"; fi
    if [ -n "$status" ] && ! printf '%s' "$status" | grep -qxE "$allowed"; then
      echo "an agent may set this status only to: ${allowed//|/, }. '$status' is a person's decision." >&2; exit 2
    fi
    find_row "$table" "$key" Status Started
    STATUS="$status" PR="$pr" NOTE="$note" REASON="$reason" EVIDENCE="$evidence" python3 -I -c '
import json,os,time
row=json.load(open("row.json")); f={}; e=os.environ; now=time.strftime("%Y-%m-%d %H:%M")
if e["STATUS"]:
    f["Status"]=[e["STATUS"]]
    if e["STATUS"]=="Done": f["Completed"]=now
    if e["STATUS"]=="Building" and not row.get("Started"): f["Started"]=now
    if e["STATUS"]=="In Acceptance": f["Shipped"]=now
if e["PR"]: f["PR"]=e["PR"]
if e["NOTE"]: f["Notes"]=e["NOTE"]
if e["REASON"]: f["Blocked Reason"]=e["REASON"]
if e["EVIDENCE"]: f["Evidence"]=e["EVIDENCE"]
if not f: raise SystemExit("nothing to write: give --status, --pr, --note, --blocked-reason or --evidence")
json.dump({row["record_id"]:f},open("update.json","w"),ensure_ascii=False)'
    write_row "$table" "$yes" ;;
  *) sed -n '2,12p' "$root/scripts/tracker-lark.sh" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
