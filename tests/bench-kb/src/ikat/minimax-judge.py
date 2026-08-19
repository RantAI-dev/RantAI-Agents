#!/usr/bin/env python3
"""
MiniMax-M3 as a second, independent-vendor judge on the annotation-scale
protocol — same manifest, same images, same Indonesian prompt, verbatim.

Why. Every judge number in the study so far comes from one vendor's models,
and the kappa that licenses them (0.552/0.556) is a per-model credential that
does not transfer. Before MiniMax is allowed to gate or judge anything, it
takes the same exam: the 165-item pool manifest whose 45 labelled items carry
360 human-labelled pairs. If its kappa lands near the incumbent's, we gain an
independent instrument; if not, that is a result about judge transfer, not a
licence to shop for a better one.

Output: judge-labels-minimax.json in the exact schema of judge-labels.json,
so ppi-eval.ts consumes it via IKAT_JUDGE_LABELS.

Usage:
  python3 src/ikat/minimax-judge.py [--limit N]
Requires MINIMAX_API_KEY (stripped of the .env line's trailing comment).
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request

BENCH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCALE = os.path.join(BENCH, "corpus", "annotation-scale")
MODEL = os.environ.get("MINIMAX_MODEL", "MiniMax-M3")
BASE = os.environ.get("MINIMAX_BASE_URL", "https://api.minimax.io/v1")

PROMPT = """Anda menilai apakah sebuah gambar benar-benar MEMBANTU MENJAWAB sebuah pertanyaan.

Pertanyaan:
{Q}

Di bawah ini ada {N} gambar, diberi nomor 1 sampai {N} sesuai urutan.

Aturan:
- Boleh memilih lebih dari satu gambar, atau TIDAK SATU PUN.
- Banyak pertanyaan memang tidak butuh gambar. Menjawab "tidak ada" adalah jawaban yang benar dan sering.
- Nilai gambar dari ISINYA, bukan dari keindahannya. Gambar hiasan yang tidak mengajarkan apa pun jangan dipilih.
- Jika ragu, jangan dipilih.

Jawab HANYA dengan satu baris JSON, tanpa penjelasan:
{{"picked": [nomor, ...]}}
Gunakan {{"picked": []}} bila tidak ada gambar yang membantu."""


def key():
    k = os.environ.get("MINIMAX_API_KEY", "").split()[0] if os.environ.get("MINIMAX_API_KEY") else ""
    if not k:
        line = ""
        for p in (os.path.join(BENCH, "..", "..", "..", ".env"),):
            try:
                with open(p) as f:
                    for l in f:
                        if l.startswith("MINIMAX_API_KEY="):
                            line = l
            except OSError:
                pass
        k = line.split("=", 1)[1].split()[0].strip('"\n') if line else ""
    if not k:
        sys.exit("MINIMAX_API_KEY not found")
    return k


def call(k, question, image_paths):
    parts = [{"type": "text", "text": PROMPT.format(Q=question, N=len(image_paths))}]
    for p in image_paths:
        b64 = base64.b64encode(open(p, "rb").read()).decode()
        parts.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
    body = {"model": MODEL, "messages": [{"role": "user", "content": parts}],
            "max_tokens": 2000, "temperature": 0.0}
    req = urllib.request.Request(f"{BASE}/chat/completions", json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "Authorization": f"Bearer {k}"})
    r = json.load(urllib.request.urlopen(req, timeout=180))
    text = r["choices"][0]["message"]["content"] or ""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def parse_picked(reply, n):
    """Mirrors judge-scale.ts: tolerant of fences and prose; None if unparseable
    — a None is retried rather than silently becoming a confident 'no'."""
    m = re.search(r'\{[^{}]*"picked"[^{}]*\}', reply)
    if not m:
        return None
    try:
        arr = json.loads(m.group(0)).get("picked")
    except Exception:
        return None
    if not isinstance(arr, list):
        return None
    out = sorted({int(x) for x in arr if isinstance(x, (int, float)) and 1 <= int(x) <= n})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    k = key()

    manifest = json.load(open(os.path.join(SCALE, "manifest.json")))
    if args.limit:
        manifest = manifest[: args.limit]

    prog_path = os.path.join(SCALE, "minimax-progress.jsonl")
    done = {}
    if os.path.exists(prog_path):
        for l in open(prog_path):
            r = json.loads(l)
            done[r["item"]] = r
    prog = open(prog_path, "a")

    t0 = time.time()
    unparsed = 0
    for i, it in enumerate(manifest):
        if it["item"] in done:
            continue
        imgs = [os.path.join(SCALE, "small", f"i{it['item']}-{j}.jpg")
                for j in range(len(it["shownFigureIds"]))]
        missing = [p for p in imgs if not os.path.exists(p)]
        if missing:
            print(f"  [{it['item']}] skipping, {len(missing)} crops missing", flush=True)
            continue
        picked = None
        for attempt in range(3):
            try:
                reply = call(k, it["question"], imgs)
                picked = parse_picked(reply, len(imgs))
                if picked is not None:
                    break
                print(f"  [{it['item']}] unparsed attempt {attempt+1}: {reply[:100]!r}", flush=True)
            except Exception as e:
                print(f"  [{it['item']}] error attempt {attempt+1}: {e}", flush=True)
                time.sleep(5 * (attempt + 1))
        if picked is None:
            unparsed += 1
            continue
        row = {"item": it["item"], "picked": picked}
        prog.write(json.dumps(row) + "\n")
        prog.flush()
        done[it["item"]] = row
        if (i + 1) % 10 == 0:
            rate = (time.time() - t0) / max(1, len(done))
            print(f"  {len(done)}/{len(manifest)} judged ({rate:.1f}s/item)", flush=True)

    labels = []
    for it in manifest:
        r = done.get(it["item"])
        if r is None:
            continue
        labels.append({
            "questionId": it["questionId"], "labelled": it["labelled"],
            "shownFigureIds": it["shownFigureIds"],
            "picked": [it["shownFigureIds"][n - 1] for n in r["picked"]],
        })
    out = {
        "model": f"{MODEL} (MiniMax API, images inline)",
        "protocol": "annotator instruction verbatim; 8 candidates; pools reused verbatim where a person annotated",
        "nCandidates": 8,
        "labels": labels,
    }
    outp = os.path.join(SCALE, "judge-labels-minimax.json")
    json.dump(out, open(outp, "w"), indent=1)
    print(f"\n{len(labels)} items labelled, {unparsed} unparsed after retries")
    print(f"wrote {outp}")


if __name__ == "__main__":
    main()
