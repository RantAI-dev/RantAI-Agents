#!/usr/bin/env python3
"""
Rebuild the figure crops for a built corpus from the source PDFs.

The crops for ugm3-built were deleted in a disk cleanup, which blocked the
prediction-powered estimator: it needs a judge pass over candidate pools drawn
the way the annotator's were, and a pool cannot be shown without its images.

Nothing has to be re-extracted to get them back. The built corpus already records,
for every figure, its page and its bounding box in normalised page coordinates.
So the crop is a render plus a rectangle — no layout parser, no GPU, no model.

Pages are rendered once and shared by every figure on them. That matters: half
the figures in this corpus share a page with another, so per-figure rendering
would do the expensive step twice for no reason.

Usage:
  python3 src/ikat/regen-crops.py [--dpi 150] [--limit N] [--verify]

--verify compares a sample of rebuilt crops against the surviving copies inside
the annotation exports, which is the only way to know the geometry still agrees
with the crops the annotator actually saw.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from glob import glob

BENCH = os.path.join(os.path.dirname(__file__), "..", "..")
CORPUS = os.path.abspath(os.path.join(BENCH, "corpus", os.environ.get("IKAT_CORPUS", "ugm3-built")))
OUT = os.path.abspath(os.path.join(BENCH, "corpus", os.environ.get("IKAT_FIGURES", "ugm3-figures")))
# Where the source PDFs live. Colon-separated, so a checkout elsewhere needs no
# edit: IKAT_PDF_DIRS=/path/one:/path/two python3 regen-crops.py
PDF_DIRS = [d for d in os.environ.get("IKAT_PDF_DIRS", "").split(":") if d]


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def find_pdfs() -> dict:
    out = {}
    for d in PDF_DIRS:
        for p in glob(os.path.join(d, "*.pdf")):
            out[slugify(os.path.basename(p)[:-4])] = p
    return out


def match_pdf(slug: str, pdfs: dict):
    """Exact first, then longest common prefix — some corpus slugs are truncated."""
    if slug in pdfs:
        return pdfs[slug]
    best, best_len = None, 0
    for k, v in pdfs.items():
        n = len(os.path.commonprefix([slug, k]))
        if n > best_len and n >= 40:
            best, best_len = v, n
    return best


# The corpus numbers pages from zero; pdftoppm numbers from one. Getting this
# wrong does not fail — it crops the right rectangle from the wrong page, and the
# result looks like a perfectly normal figure. It cost a full rebuild to find,
# and an aspect-ratio check could never have caught it.
PAGE_OFFSET = int(os.environ.get("IKAT_PAGE_OFFSET", "1"))


def render_page(pdf: str, page: int, dpi: int, tmp: str):
    page = page + PAGE_OFFSET
    stem = os.path.join(tmp, f"p{page}")
    subprocess.run(
        ["pdftoppm", "-png", "-r", str(dpi), "-f", str(page), "-l", str(page), pdf, stem],
        check=True, capture_output=True,
    )
    hits = glob(stem + "*.png")
    return hits[0] if hits else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dpi", type=int, default=150)
    ap.add_argument("--limit", type=int, default=0, help="stop after N documents")
    ap.add_argument("--verify", action="store_true")
    args = ap.parse_args()

    pdfs = find_pdfs()
    if not pdfs:
        print("No source PDFs found. Set IKAT_PDF_DIRS to the directory holding them,")
        print("e.g. IKAT_PDF_DIRS=/data/books python3 regen-crops.py")
        sys.exit(1)
    docs = sorted(glob(os.path.join(CORPUS, "*.json")))
    if args.limit:
        docs = docs[: args.limit]

    total = made = skipped = failed = 0
    for dpath in docs:
        doc = json.load(open(dpath))
        slug = doc["slug"]
        pdf = match_pdf(slug, pdfs)
        figs = [f for f in (doc.get("figures") or []) if not f.get("decorative") and f.get("assetFile")]
        total += len(figs)
        if not pdf:
            print(f"  {slug}: NO PDF — {len(figs)} figures skipped")
            skipped += len(figs)
            continue

        by_page = defaultdict(list)
        for f in figs:
            by_page[int(f.get("page", 0))].append(f)

        outdir = os.path.join(OUT, slug)
        os.makedirs(outdir, exist_ok=True)
        n_doc = 0
        with tempfile.TemporaryDirectory() as tmp:
            for page, group in sorted(by_page.items()):
                # pdftoppm pages are 1-based; the corpus records them the same way.
                try:
                    img = render_page(pdf, page, args.dpi, tmp)
                except subprocess.CalledProcessError:
                    img = None
                if not img:
                    failed += len(group)
                    continue
                size = subprocess.run(["magick", "identify", "-format", "%w %h", img],
                                      capture_output=True, text=True).stdout.split()
                if len(size) != 2:
                    failed += len(group)
                    continue
                W, H = int(size[0]), int(size[1])
                for f in group:
                    x0, y0, x1, y1 = f["bbox"]
                    w, h = max(1, round((x1 - x0) * W)), max(1, round((y1 - y0) * H))
                    x, y = round(x0 * W), round(y0 * H)
                    dst = os.path.join(outdir, os.path.basename(f["assetFile"]))
                    r = subprocess.run(
                        ["magick", img, "-crop", f"{w}x{h}+{x}+{y}", "+repage", dst],
                        capture_output=True,
                    )
                    if r.returncode == 0 and os.path.exists(dst):
                        made += 1
                        n_doc += 1
                    else:
                        failed += 1
                os.remove(img)
        print(f"  {slug}: {n_doc}/{len(figs)}")

    print(f"\nrebuilt {made}/{total} crops ({skipped} without a source PDF, {failed} failed) at {args.dpi} dpi")
    print(f"wrote {OUT}")

    if args.verify:
        verify()


def verify():
    """Compare rebuilt crops against the copies the annotator was shown.

    This compares PIXELS, not shape. An earlier version compared aspect ratio and
    reported 384 of 384 agreeing while every crop was taken from the wrong page —
    the rectangle was right, so the shape matched, and the check was blind to the
    only thing that mattered. Both images are normalised to a common small size
    and greyscaled first, because the surviving copies were downscaled and
    re-encoded, then compared by RMSE.
    """
    ann = os.path.abspath(os.path.join(BENCH, "corpus", "annotation"))
    key = json.load(open(os.path.join(ann, "annotation.KEY.json")))
    figmap = {}
    for d in glob(os.path.join(CORPUS, "*.json")):
        doc = json.load(open(d))
        for f in doc.get("figures") or []:
            if f.get("assetFile"):
                figmap[f["id"]] = os.path.join(OUT, doc["slug"], os.path.basename(f["assetFile"]))

    def rmse(a: str, b: str):
        """Normalised RMSE in [0,1]; below ~0.15 is the same picture."""
        r = subprocess.run(
            ["magick", "compare", "-metric", "RMSE",
             "(", a, "-colorspace", "Gray", "-resize", "64x64!", ")",
             "(", b, "-colorspace", "Gray", "-resize", "64x64!", ")",
             "null:"],
            capture_output=True, text=True,
        )
        out = (r.stderr or "").strip()
        if "(" in out and ")" in out:
            try:
                return float(out[out.index("(") + 1:out.index(")")])
            except ValueError:
                return None
        return None

    checked = agree = 0
    worst = []
    for k in key:
        for j, fid in enumerate(k["shownFigureIds"]):
            orig = None
            for ext in ("png", "jpg", "jpeg"):
                cand = os.path.join(ann, "images", f"i{k['item']}-{j}.{ext}")
                if os.path.exists(cand):
                    orig = cand
                    break
            new = figmap.get(fid)
            if not orig or not new or not os.path.exists(new):
                continue
            d = rmse(orig, new)
            if d is None:
                continue
            checked += 1
            if d < 0.15:
                agree += 1
            else:
                worst.append((d, fid))
    if checked:
        print(f"\nverify: {agree}/{checked} rebuilt crops match the annotator's copy pixel-wise "
              f"({100 * agree / checked:.1f}%)")
        for d, fid in sorted(worst, reverse=True)[:5]:
            print(f"  mismatch RMSE {d:.3f}  {fid}")
    else:
        print("\nverify: no comparable pairs found")


if __name__ == "__main__":
    main()
