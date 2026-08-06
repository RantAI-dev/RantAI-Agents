"""
Per-question retrieval hit, dumped so variants can be compared PAIRED.

The variants are evaluated on the same questions, so an unpaired comparison of
two percentages throws away the pairing and badly understates significance —
or, more dangerously here, lets a difference of seven questions look like a
finding. McNemar's exact test on the discordant pairs is the right instrument.
"""
import json, glob, os, sys, math, urllib.request

TEI = os.environ.get("IKAT_TEI_BASE", "http://rantai-agents-tei-embed-1:80")
TOPK = int(os.environ.get("TOPK", "5"))

def embed(texts, batch=32):
    out = []
    for i in range(0, len(texts), batch):
        body = json.dumps({"inputs": [t[:7000] for t in texts[i:i+batch]], "truncate": True}).encode()
        req = urllib.request.Request(f"{TEI}/embed", data=body, headers={"Content-Type": "application/json"})
        out.extend(json.load(urllib.request.urlopen(req, timeout=600)))
    return out

def cos(a, b):
    d = sum(x*y for x, y in zip(a, b)); na = math.sqrt(sum(x*x for x in a)); nb = math.sqrt(sum(y*y for y in b))
    return d/(na*nb) if na and nb else 0.0

qs = [q for q in json.load(open("/ikat/tests/bench-kb/corpus/questions-ugm.json")) if q["goldFigureIds"]]
res = {}
for corpus in sys.argv[1:]:
    docs = {}
    for p in glob.glob(f"/ikat/tests/bench-kb/corpus/{corpus}/*.json"):
        d = json.load(open(p)); docs[d["slug"]] = d
    figchunk = {f["id"]: f["anchorChunkId"] for d in docs.values() for f in d["figures"]}
    per = {}
    for slug, d in docs.items():
        dq = [q for q in qs if q["docSlug"] == slug]
        if not dq: continue
        cv = embed([c["text"] for c in d["chunks"]]); qv = embed([q["question"] for q in dq])
        for q, v in zip(dq, qv):
            want = {figchunk.get(g) for g in q["goldFigureIds"] if figchunk.get(g)}
            if not want: continue
            top = sorted(range(len(cv)), key=lambda i: -cos(v, cv[i]))[:TOPK]
            per[q["id"]] = 1 if (want & {d["chunks"][i]["id"] for i in top}) else 0
    res[corpus] = per
    print(f"{corpus}: {sum(per.values())}/{len(per)} = {100*sum(per.values())/len(per):.1f}%", flush=True)

json.dump(res, open("/ikat/hitrate-per-question.json", "w"))
print("\n=== paired McNemar (exact, two-sided) ===")
names = sys.argv[1:]
for i in range(len(names)):
    for j in range(i+1, len(names)):
        a, b = res[names[i]], res[names[j]]
        common = set(a) & set(b)
        n01 = sum(1 for k in common if a[k] == 0 and b[k] == 1)
        n10 = sum(1 for k in common if a[k] == 1 and b[k] == 0)
        n = n01 + n10
        if n == 0:
            print(f"{names[i]:20s} vs {names[j]:20s}: identical"); continue
        # exact binomial two-sided
        p = sum(math.comb(n, k) for k in range(0, min(n01, n10)+1)) / (2**n) * 2
        p = min(1.0, p)
        print(f"{names[i]:20s} vs {names[j]:20s}: b={n10} c={n01} discordant={n}  p={p:.3f}"
              f"  {'SIGNIFICANT' if p < 0.05 else 'not significant'}")
