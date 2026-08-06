"""
Positive control for the figure-dependence filter, re-run for the SEA-LION
adversary.

The filter only means something if the adversary CAN answer when the answer is
present. If it refuses everything, "rejected as text-answerable 0" is vacuous and
the figure-dependent class — the instrument for C1 — is unverified.

Takes questions whose answer IS in the gold chunk, shows the adversary that
chunk, and counts how often it answers instead of refusing.
"""
import json, urllib.request

MODEL = "hf.co/mradermacher/Qwen-SEA-LION-v4-8B-VL-GGUF:Q8_0"
P = ("Jawab pertanyaan berikut HANYA berdasarkan teks yang diberikan.\n\nTeks:\n---\n{CTX}\n---\n\n"
     "Pertanyaan: {Q}\n\nJika teks tidak memuat informasi yang cukup untuk menjawab, "
     "balas persis: TIDAK ADA DI TEKS\n\nJawaban singkat:")

qs = json.load(open("/ikat/tests/bench-kb/corpus/questions-ugm.json"))
docs = {}
import os
for f in os.listdir("/ikat/tests/bench-kb/corpus/ugm-built"):
    d = json.load(open("/ikat/tests/bench-kb/corpus/ugm-built/" + f))
    docs[d["slug"]] = d

def ask(ctx, q):
    body = json.dumps({"model": MODEL, "max_tokens": 200, "temperature": 0,
                       "messages": [{"role": "user", "content": P.replace("{CTX}", ctx).replace("{Q}", q)}]}).encode()
    r = urllib.request.Request("http://ollama:11434/v1/chat/completions", data=body,
                               headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=600))["choices"][0]["message"]["content"]

# Positive control: factual questions, answer present in the gold chunk.
fac = [q for q in qs if q["type"] == "factual" and q["goldChunkIds"]][:8]
answered = 0
for q in fac:
    d = docs.get(q["docSlug"])
    c = next((c for c in d["chunks"] if c["id"] == q["goldChunkIds"][0]), None) if d else None
    if not c:
        continue
    out = ask(c["text"], q["question"])
    refused = "TIDAK ADA DI TEKS" in out.upper()
    answered += 0 if refused else 1
    print(("REFUSED  " if refused else "answered ") + "| " + q["question"][:75])
print(f"\nPOSITIVE CONTROL: adversary answered {answered}/{len(fac)} text-answerable questions")

# Negative control: same questions, but with UNRELATED text. It should refuse.
other = next(c["text"] for d in docs.values() for c in d["chunks"] if len(c["text"]) > 800)
refused_neg = 0
for q in fac[:4]:
    out = ask(other, q["question"])
    if "TIDAK ADA DI TEKS" in out.upper():
        refused_neg += 1
print(f"NEGATIVE CONTROL: adversary refused {refused_neg}/4 when shown unrelated text")
