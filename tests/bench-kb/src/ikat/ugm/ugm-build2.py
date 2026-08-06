#!/usr/bin/env python3
"""
Build the anchored corpus using MinerU's BLOCK TYPES.

Revision 2. The previous build treated every non-figure block as prose, because
the sidecar only reported "text". It now reports MinerU's own type, and three
things follow — each aimed at the measured bottleneck, which is retrieval (only
~52% of figure-bearing questions retrieve the chunk holding their figure):

  1. DROP page furniture.  `page_number` and `footer` blocks are running
     headers/footers, not content. In the maths teacher guide alone they are 441
     of 3,079 blocks (14.3%). Embedding them dilutes every chunk that contains
     them and pollutes the vector with text no reader would ever search for.

  2. RECORD the heading, do not split on it.  Each chunk carries the heading in
     force, which is useful context — but breaking at headings was measured to
     HURT retrieval badly (see HEADING_MODE below). Kept as an option, off by
     default, because the negative result is worth being able to reproduce.

  3. KEEP captions.  Caption blocks (`image_caption`, `table_caption`,
     `image_footnote`, `table_footnote`) were dropped entirely before. They are
     the most figure-descriptive prose in the book; a caption belongs to its
     figure AND stays in the reading order.

The anchor invariant is unchanged: chunks split only at block boundaries, so a
figure's anchor always lands inside exactly one chunk, never between two.
"""
import base64
import json
import os
import re

RAW_DIR = os.environ.get("RAW_DIR", "/ikat/ugm-raw")
OUT_DIR = os.environ.get("OUT_DIR", "/ikat/tests/bench-kb/corpus/ugm2-built")
FIG_DIR = os.environ.get("FIG_DIR", "/ikat/tests/bench-kb/corpus/ugm2-figures")
CHUNK_CHARS = 1200

# Running headers/footers: never content.
FURNITURE = {"page_number", "footer"}
# Section starts.
HEADING = {"title"}

CAPTION_RE = re.compile(r"^(gambar|tabel|foto|diagram|grafik|bagan|ilustrasi)\b", re.I)


def build_blocks(pages_blocks, known_ids):
    """Flatten per-page block lists into one reading-order sequence, dropping
    page furniture but keeping everything a reader would actually read."""
    blocks = []
    dropped = 0
    for page_index, page in enumerate(pages_blocks or []):
        for b in page:
            kind = b.get("kind")
            btype = b.get("type") or ""
            if kind == "figure":
                if b.get("id") in known_ids:
                    blocks.append(
                        {"index": len(blocks), "page": page_index, "kind": "figure",
                         "type": "figure", "text": "", "figureId": b["id"]}
                    )
                continue
            if btype in FURNITURE:
                dropped += 1
                continue
            txt = (b.get("text") or "").strip()
            if not txt:
                continue
            blocks.append(
                {"index": len(blocks), "page": page_index,
                 "kind": "caption" if kind == "caption" else "text",
                 "type": btype or "text", "text": txt}
            )
    return blocks, dropped


# How headings affect chunking.
#   "split"  — break at every heading (revision 2; measured WORSE, see below)
#   "prefer" — break at a heading only once the chunk is reasonably full
#   "off"    — headings are ordinary text; size is the only criterion
#
# Measured, all four on the same questions, embedder and top-k:
#
#   baseline (no block types)                2,188 chunks   hit@5 51.8%
#   furniture dropped + captions kept        2,108 chunks   hit@5 59.6%   <- default
#   + heading break when chunk is half full  2,624 chunks   hit@5 56.0%
#   + heading break at every heading         7,044 chunks   hit@5 40.4%
#
# The block types help, but for CLEANING, not for splitting. Dropping running
# headers/footers and keeping caption blocks lifts the ceiling that bounds every
# figure mechanism by 7.8 points. Breaking on headings hurts monotonically with
# how aggressively it is applied: it shrinks chunks, and the same top-5 then
# covers less text. Default is "off" for that reason, not by preference.
HEADING_MODE = os.environ.get("HEADING_MODE", "off")
# A heading only justifies an early break once the chunk carries this much.
HEADING_MIN_FILL = 0.5


def chunk_blocks(blocks, slug):
    chunks, buf, size, n = [], [], 0, 0
    heading = None

    def flush():
        nonlocal buf, size, n
        if not buf:
            return
        text = "\n\n".join(b["text"] for b in buf)
        chunks.append(
            {"id": f"{slug}::c{n}", "docSlug": slug,
             "fromBlock": buf[0]["index"], "toBlock": buf[-1]["index"],
             "page": buf[0]["page"], "heading": heading, "text": text}
        )
        n += 1
        buf, size = [], 0

    for b in blocks:
        if b["kind"] == "figure":
            continue
        is_heading = b["type"] in HEADING
        if is_heading:
            # A heading is the best available break point, but only worth taking
            # when the current chunk has enough in it to stand alone.
            if HEADING_MODE == "split" and buf:
                flush()
            elif HEADING_MODE == "prefer" and buf and size >= CHUNK_CHARS * HEADING_MIN_FILL:
                flush()
            heading = b["text"][:120]
        if size + len(b["text"]) > CHUNK_CHARS and buf:
            flush()
        buf.append(b)
        size += len(b["text"])
    flush()
    return chunks


def context_for(blocks, at, radius=1):
    parts = []
    for j in range(at - radius, at + radius + 1):
        if 0 <= j < len(blocks) and blocks[j]["kind"] in ("text", "caption") and blocks[j]["text"]:
            parts.append(blocks[j]["text"])
    return " ".join(parts)[:1500]


def printed_caption(blocks, at):
    """Prefer a real caption BLOCK next to the figure; fall back to prose that
    looks like a caption. The block type is authoritative where present."""
    for j in (at + 1, at - 1):
        if 0 <= j < len(blocks) and blocks[j]["kind"] == "caption":
            return blocks[j]["text"][:200]
    for j in (at + 1, at - 1):
        if 0 <= j < len(blocks) and blocks[j]["kind"] == "text":
            t = blocks[j]["text"].strip()
            if CAPTION_RE.match(t):
                return t[:200]
    return None


def chunk_for_anchor(chunks, anchor_index):
    best = None
    for c in chunks:
        if c["fromBlock"] <= anchor_index <= c["toBlock"]:
            return c["id"]
        if c["toBlock"] < anchor_index and (best is None or c["toBlock"] > best["toBlock"]):
            best = c
    return best["id"] if best else None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(FIG_DIR, exist_ok=True)
    files = sorted(f for f in os.listdir(RAW_DIR) if f.endswith(".json"))
    t_fig = t_anch = t_cap = t_drop = t_chunks = t_head = 0

    for fname in files:
        raw = json.load(open(os.path.join(RAW_DIR, fname)))
        src = raw.get("_source", {})
        slug = src.get("slug") or fname[:-5]
        by_id = {f.get("id"): f for f in (raw.get("figures") or []) if f.get("id")}

        blocks, dropped = build_blocks(raw.get("pages_blocks"), set(by_id))
        chunks = chunk_blocks(blocks, slug)

        fig_dir = os.path.join(FIG_DIR, slug)
        os.makedirs(fig_dir, exist_ok=True)
        figures = []
        for i, b in enumerate(blocks):
            if b["kind"] != "figure":
                continue
            sf = by_id.get(b["figureId"])
            if not sf:
                continue
            png = f"{b['figureId']}.png"
            if sf.get("image_b64"):
                with open(os.path.join(fig_dir, png), "wb") as fh:
                    fh.write(base64.b64decode(sf["image_b64"]))
            bbox = sf.get("bbox") or [0, 0, 1, 1]
            figures.append(
                {"id": f"{slug}::{b['figureId']}", "docSlug": slug, "page": b["page"],
                 "assetFile": os.path.join(slug, png), "bbox": bbox,
                 "area": max(0.0, bbox[2] - bbox[0]) * max(0.0, bbox[3] - bbox[1]),
                 "decorative": False, "anchorIndex": b["index"],
                 "ctx": context_for(blocks, i),
                 "caption": sf.get("caption") or printed_caption(blocks, i),
                 "anchorChunkId": chunk_for_anchor(chunks, b["index"])}
            )

        doc = {"slug": slug, "title": src.get("title") or slug,
               "pageCount": raw.get("pages") or 0,
               "blocks": blocks, "chunks": chunks, "figures": figures}
        with open(os.path.join(OUT_DIR, slug + ".json"), "w") as fh:
            json.dump(doc, fh)

        heads = sum(1 for c in chunks if c.get("heading"))
        t_fig += len(figures)
        t_anch += sum(1 for f in figures if f["anchorChunkId"])
        t_cap += sum(1 for f in figures if f["caption"])
        t_drop += dropped
        t_chunks += len(chunks)
        t_head += heads
        print(f"[build2] {slug}: {len(blocks)} blocks (+{dropped} furniture dropped), "
              f"{len(chunks)} chunks ({heads} with heading), {len(figures)} figures",
              flush=True)

    pct = lambda n: (100.0 * n / t_fig) if t_fig else 0.0
    print(f"[build2] corpus: {len(files)} docs, {t_chunks} chunks "
          f"({t_head} carry a heading), {t_fig} figures — "
          f"caption {t_cap} ({pct(t_cap):.1f}%), anchored {t_anch} ({pct(t_anch):.1f}%), "
          f"page furniture dropped: {t_drop}", flush=True)


if __name__ == "__main__":
    main()
