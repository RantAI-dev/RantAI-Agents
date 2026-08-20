#!/usr/bin/env python3
"""
MiniMax-M3 as the SECOND judge on the end-to-end judged half.

The judged placement tie (docs/15) currently rests on one judge model. This
runs the identical blind manifest — same neutral keys, same rubric, same
scales — through an independent vendor. Two things come out: inter-judge
agreement (does the instrument replicate at all), and whether the paired A−B
conclusions (selection to the generator, placement a tie) survive a judge
swap. If they do not, that is a finding about the metric, and it goes in the
paper either way.

Output: corpus/results/endtoend/judge-verdicts-minimax.json — same row schema
as the first judge's batches, one file.

Usage:
  python3 src/ikat/minimax-judge-endtoend.py [--limit N]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

BENCH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(BENCH, "corpus", "results", "endtoend")
MODEL = os.environ.get("MINIMAX_MODEL", "MiniMax-M3")
BASE = os.environ.get("MINIMAX_BASE_URL", "https://api.minimax.io/v1")

RUBRIC = """You are an impartial evaluation judge for multimodal question-answering, following the MRAMG-Bench LLM-judge protocol. Judge this item on its own; do not guess which system produced it.

The answer contains image markers like <img1>; each corresponds to an entry in "images", whose context/caption is source text surrounding that image in the original document (a textual stand-in for the image itself).

Produce four scores:
- relevance (1-5): how relevant the inserted images are to the query and answer. 1 = completely unrelated, 3 = partially related, 5 = highly relevant.
- effectiveness (1-5): whether the images align with the QA content and contribute to understanding. 1 = harmful, 3 = neutral, 5 = crucial details.
- position (0-1): the fraction of images whose marker is placed such that the image is contextually relevant to at least one of the sentences immediately around its marker (score each image 0 or 1, then average).
- comprehensive (1-5): overall quality of the multimodal answer for the query. 1 = fails to address it, 3 = adequate, 5 = detailed and insightful with images complementing the text.

If the images list is empty: relevance, effectiveness and position are null; still score comprehensive (cap at 4 when a figure would clearly have helped).

Reply with ONLY one line of JSON:
{"relevance": n|null, "effectiveness": n|null, "position": x|null, "comprehensive": n}

ITEM:
"""


def key():
    k = (os.environ.get("MINIMAX_API_KEY") or "").split()
    if k:
        return k[0]
    sys.exit("MINIMAX_API_KEY not set")


def call(k, item):
    payload = {"query": item["query"], "answer": item["answer"], "images": item["images"]}
    body = {"model": MODEL,
            "messages": [{"role": "user", "content": RUBRIC + json.dumps(payload, ensure_ascii=False)}],
            "max_tokens": 1800, "temperature": 0.0}
    req = urllib.request.Request(f"{BASE}/chat/completions", json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "Authorization": f"Bearer {k}"})
    r = json.load(urllib.request.urlopen(req, timeout=180))
    text = r["choices"][0]["message"]["content"] or ""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def parse(reply, has_images):
    m = re.search(r"\{[^{}]*\}", reply)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except Exception:
        return None
    out = {}
    for f, lo, hi in (("relevance", 1, 5), ("effectiveness", 1, 5), ("position", 0, 1), ("comprehensive", 1, 5)):
        v = d.get(f)
        if v is None:
            if f == "comprehensive" or has_images:
                if f == "comprehensive":
                    return None
            out[f] = None
            continue
        try:
            v = float(v)
        except Exception:
            return None
        if not (lo <= v <= hi):
            return None
        out[f] = v
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    k = key()

    items = [json.loads(l) for l in open(os.path.join(OUT, "judge-manifest.jsonl")) if l.strip()]
    if args.limit:
        items = items[: args.limit]

    prog_path = os.path.join(OUT, "minimax-endtoend-progress.jsonl")
    done = {}
    if os.path.exists(prog_path):
        for l in open(prog_path):
            r = json.loads(l)
            done[r["key"]] = r
    prog = open(prog_path, "a")

    t0 = time.time()
    for i, it in enumerate(items):
        if it["key"] in done:
            continue
        v = None
        for attempt in range(3):
            try:
                v = parse(call(k, it), bool(it["images"]))
                if v is not None:
                    break
            except Exception as e:
                print(f"  [{it['key']}] error attempt {attempt+1}: {e}", flush=True)
                time.sleep(5 * (attempt + 1))
        if v is None:
            print(f"  [{it['key']}] unparsed, skipped", flush=True)
            continue
        row = {"key": it["key"], **v}
        prog.write(json.dumps(row) + "\n")
        prog.flush()
        done[it["key"]] = row
        if (i + 1) % 25 == 0:
            print(f"  {len(done)}/{len(items)} ({(time.time()-t0)/max(1,len(done)):.1f}s/item)", flush=True)

    rows = [done[it["key"]] for it in items if it["key"] in done]
    outp = os.path.join(OUT, "judge-verdicts-minimax.json")
    json.dump(rows, open(outp, "w"), indent=0)
    print(f"\n{len(rows)}/{len(items)} judged; wrote {outp}")


if __name__ == "__main__":
    main()
