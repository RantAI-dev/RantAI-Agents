"""
Is the RIGHT figure even reachable? — candidate-pool recall at increasing k.

Our selection F1 is 0.218 (P 0.162 / R 0.331). Before building any reranker or
threshold we need to know which of two worlds we are in:

  (a) the correct figure is usually IN the candidate pool and we rank it badly
      -> a ranking/filtering problem; a reranker is the right tool
  (b) the correct figure is usually ABSENT from the pool
      -> an extraction/anchoring problem; no reranker can recover it

Three separate literature reviews independently insisted this be measured first,
and they are right: a filter is a monotone recall-destroyer. Bolting one onto a
pool that lacks the answer only makes us confidently silent.

What this measures, per question that has at least one gold figure:

  reachable   — does the gold figure have an anchor chunk at all? A figure with
                no anchor is invisible to retrieval at every k, so it bounds
                everything else. This is the extraction-quality term.
  recall@k    — is the gold figure's anchor chunk among the top-k retrieved
                chunks? This is the retrieval term, and its gap to `reachable`
                is exactly what a bigger candidate pool can buy.

Reported as macro (mean over questions) and micro (over gold figures), because
questions carry different numbers of gold figures and the two can disagree.

Usage (inside the ikat-bench container):
  IKAT_QUESTIONS=questions-ugm-large.json python3 candidate-recall.py ugm3-built
"""
import json, glob, os, sys, math, urllib.request

TEI = os.environ.get("IKAT_TEI_BASE", "http://rantai-agents-tei-embed-1:80")
ROOT = os.environ.get("IKAT_ROOT", "/ikat/tests/bench-kb/corpus")
QFILE = os.environ.get("IKAT_QUESTIONS", "questions-ugm-large.json")
KS = [1, 3, 5, 10, 20, 50, 100]


def embed(texts, batch=32):
    out = []
    for i in range(0, len(texts), batch):
        body = json.dumps({"inputs": [t[:7000] for t in texts[i : i + batch]], "truncate": True}).encode()
        req = urllib.request.Request(f"{TEI}/embed", data=body, headers={"Content-Type": "application/json"})
        out.extend(json.load(urllib.request.urlopen(req, timeout=600)))
    return out


def cos(a, b):
    d = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return d / (na * nb) if na and nb else 0.0


def main():
    corpus = sys.argv[1] if len(sys.argv) > 1 else "ugm3-built"
    qs = [q for q in json.load(open(f"{ROOT}/{QFILE}")) if q.get("goldFigureIds")]
    print(f"corpus={corpus}  questions_with_gold={len(qs)}  tei={TEI}", flush=True)

    docs = {}
    for p in glob.glob(f"{ROOT}/{corpus}/*.json"):
        d = json.load(open(p))
        docs[d["slug"]] = d

    # figureId -> anchorChunkId. A figure missing here has no anchor at all.
    anchor_of = {}
    n_fig = n_anchored = 0
    for d in docs.values():
        for f in d.get("figures", []):
            n_fig += 1
            a = f.get("anchorChunkId")
            if a:
                anchor_of[f["id"]] = a
                n_anchored += 1
    print(f"figures in corpus={n_fig}  with an anchor chunk={n_anchored} ({100*n_anchored/n_fig:.1f}%)\n", flush=True)

    # per-question: set of gold figures, and which are reachable at all
    q_reachable, q_recall = [], {k: [] for k in KS}
    m_tot = m_reach = 0
    m_hit = {k: 0 for k in KS}
    skipped_no_doc = 0

    for slug, d in docs.items():
        dq = [q for q in qs if q["docSlug"] == slug]
        if not dq:
            continue
        chunks = d["chunks"]
        cv = embed([c["text"] for c in chunks])
        qv = embed([q["question"] for q in dq])
        cid = [c["id"] for c in chunks]

        for q, v in zip(dq, qv):
            gold = q["goldFigureIds"]
            m_tot += len(gold)
            want = {}
            for g in gold:
                a = anchor_of.get(g)
                if a:
                    want[g] = a
                    m_reach += 1
            q_reachable.append(len(want) / len(gold) if gold else 0.0)
            if not want:
                for k in KS:
                    q_recall[k].append(0.0)
                continue
            order = sorted(range(len(cv)), key=lambda i: -cos(v, cv[i]))
            for k in KS:
                topk = {cid[i] for i in order[:k]}
                hits = sum(1 for a in want.values() if a in topk)
                q_recall[k].append(hits / len(gold))
                m_hit[k] += hits

    mean = lambda xs: sum(xs) / len(xs) if xs else float("nan")
    print(f"{'':10} {'macro':>8} {'micro':>8}")
    print(f"{'reachable':10} {mean(q_reachable):8.3f} {m_reach/m_tot if m_tot else 0:8.3f}"
          f"   <- ceiling: no k can beat this")
    for k in KS:
        print(f"recall@{k:<4} {mean(q_recall[k]):8.3f} {m_hit[k]/m_tot if m_tot else 0:8.3f}")
    print(f"\ngold figures total={m_tot}  reachable={m_reach}  unreachable={m_tot-m_reach}")
    if skipped_no_doc:
        print(f"[warn] {skipped_no_doc} questions had no matching document")

    json.dump(
        {"corpus": corpus, "reachable_macro": mean(q_reachable),
         "recall_macro": {str(k): mean(q_recall[k]) for k in KS},
         "recall_micro": {str(k): (m_hit[k] / m_tot if m_tot else 0) for k in KS},
         "gold_total": m_tot, "gold_reachable": m_reach},
        open(f"/ikat/candidate-recall-{corpus}.json", "w"), indent=2)


if __name__ == "__main__":
    main()
