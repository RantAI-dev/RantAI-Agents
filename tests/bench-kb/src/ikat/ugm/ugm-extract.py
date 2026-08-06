#!/usr/bin/env python3
"""
Extract the IKAT-Bench corpus on the UGM box, through the patched MinerU sidecar.

Runs INSIDE the ikat-bench container, which sits on the same docker network as
mineru:8100. The books are public Kemendikbud titles, so the container fetches
each PDF itself — no corpus data is pushed through any intermediary.

`structured=true` is what makes this worth doing: the patched sidecar returns
`pages_blocks`, the per-page reading-order sequence with each surviving figure
inline. That is the anchor the whole benchmark depends on, and the pre-patch
build could not produce it at all.

Idempotent and resumable: a book already written is skipped, so an interrupted
run continues where it stopped. Extraction here is GPU-bound and slow (hundreds
of pages per book), so resumability is not optional.
"""
import json
import os
import sys
import time
import urllib.request

BOOKS = json.load(open("/ikat/ugm-books.json"))
OUT_DIR = "/ikat/ugm-raw"
PDF_DIR = "/ikat/ugm-pdf"
MINERU = os.environ.get("MINERU_URL", "http://mineru:8100")
DPI = os.environ.get("MINERU_DPI", "180")

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(PDF_DIR, exist_ok=True)


def fetch_pdf(url: str, dest: str) -> str:
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": "ikat-bench/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return dest


def post_multipart(url: str, pdf_path: str, fields: dict) -> bytes:
    """Minimal multipart/form-data POST — avoids a requests dependency."""
    boundary = "----ikatbench7f3a9c"
    body = bytearray()
    for k, v in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    body += f"--{boundary}\r\n".encode()
    body += (
        f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(pdf_path)}"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode()
    with open(pdf_path, "rb") as f:
        body += f.read()
    body += f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    # Generous timeout: a 240-page book on this GPU takes many minutes.
    with urllib.request.urlopen(req, timeout=7200) as r:
        return r.read()


def main() -> None:
    done = skipped = failed = 0
    for b in BOOKS:
        out = os.path.join(OUT_DIR, b["slug"] + ".json")
        if os.path.exists(out):
            skipped += 1
            print(f"[ugm] skip (cached): {b['slug']}", flush=True)
            continue

        t0 = time.time()
        try:
            pdf = fetch_pdf(b["url"], os.path.join(PDF_DIR, b["slug"] + ".pdf"))
            size_mb = os.path.getsize(pdf) / 1e6
            print(f"[ugm] extracting {b['slug']} ({size_mb:.0f} MB)…", flush=True)

            raw = post_multipart(
                f"{MINERU}/extract", pdf, {"dpi": DPI, "structured": "true"}
            )
            data = json.loads(raw)

            # Fail loudly if the sidecar is still the pre-patch build: silently
            # writing anchor-less output would poison the corpus in a way that
            # only shows up much later as "the anchor mechanism does nothing".
            if "pages_blocks" not in data:
                print(
                    f"[ugm] ABORT: response has no pages_blocks — the sidecar is not the patched build",
                    flush=True,
                )
                sys.exit(2)

            data["_source"] = {"slug": b["slug"], "title": b["title"], "url": b["url"]}
            with open(out, "w") as f:
                json.dump(data, f)

            nfig = len(data.get("figures") or [])
            npages = data.get("pages") or len(data.get("pages_text") or [])
            inline = sum(
                1
                for pg in (data.get("pages_blocks") or [])
                for blk in pg
                if blk.get("kind") == "figure"
            )
            print(
                f"[ugm] ok: {b['slug']} — {npages}p, {nfig} figures, "
                f"{inline} inline anchors, {time.time() - t0:.0f}s",
                flush=True,
            )
            done += 1
        except Exception as e:  # noqa: BLE001 — one bad book must not lose the rest
            failed += 1
            print(f"[ugm] FAIL {b['slug']}: {type(e).__name__}: {str(e)[:200]}", flush=True)

    print(f"[ugm] complete: {done} extracted, {skipped} cached, {failed} failed", flush=True)


if __name__ == "__main__":
    main()
