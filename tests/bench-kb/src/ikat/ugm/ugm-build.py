#!/usr/bin/env python3
"""
Build the anchored IKAT-Bench corpus from the UGM MinerU extractions.

Runs INSIDE the ikat-bench container, next to the raw output, so the figure
crops (base64, hundreds of MB across the corpus) never have to leave the box.
Only the built JSON — text, anchors, chunk spans — is small enough to pull back.

The on-premise path is simpler than the hosted one: `pages_blocks` already IS the
reading-order sequence, with figures inline at their true positions. There is no
marker recovery to do and nothing to re-associate — the anchor arrives as data.
That is the entire point of the sidecar patch.

Chunking splits ONLY at block boundaries, so every chunk covers an exact
contiguous run of blocks and each figure anchor maps to exactly one chunk,
never falling between two.
"""
import base64
import json
import os
import re

RAW_DIR = "/ikat/ugm-raw"
OUT_DIR = "/ikat/ugm-built"
FIG_DIR = "/ikat/ugm-figures"
CHUNK_CHARS = 1200

CAPTION_RE = re.compile(r"^(gambar|tabel|foto|diagram|grafik|bagan|ilustrasi)\b", re.I)


def build_blocks(pages_blocks, known_ids):
    """Flatten per-page block lists into one reading-order sequence."""
    blocks = []
    for page_index, page in enumerate(pages_blocks or []):
        for b in page:
            if b.get("kind") == "figure":
                fid = b.get("id")
                # Only figures that actually survived cropping: a dangling
                # anchor would point at an asset that does not exist.
                if fid in known_ids:
                    blocks.append(
                        {"index": len(blocks), "page": page_index, "kind": "figure", "text": "", "figureId": fid}
                    )
            else:
                t = (b.get("text") or "").strip()
                if t:
                    blocks.append({"index": len(blocks), "page": page_index, "kind": "text", "text": t})
    return blocks


def chunk_blocks(blocks, slug):
    chunks, buf, size, n = [], [], 0, 0

    def flush():
        nonlocal buf, size, n
        if not buf:
            return
        chunks.append(
            {
                "id": f"{slug}::c{n}",
                "docSlug": slug,
                "fromBlock": buf[0]["index"],
                "toBlock": buf[-1]["index"],
                "page": buf[0]["page"],
                "text": "\n\n".join(b["text"] for b in buf),
            }
        )
        n += 1
        buf, size = [], 0

    for b in blocks:
        if b["kind"] != "text":
            continue
        if size + len(b["text"]) > CHUNK_CHARS and buf:
            flush()
        buf.append(b)
        size += len(b["text"])
    flush()
    return chunks


def context_for(blocks, at, radius=1):
    parts = []
    for j in range(at - radius, at + radius + 1):
        if 0 <= j < len(blocks) and blocks[j]["kind"] == "text" and blocks[j]["text"]:
            parts.append(blocks[j]["text"])
    return " ".join(parts)[:1500]


def printed_caption(blocks, at):
    """A caption is an adjacent text block that announces the figure."""
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
    tot_figs = tot_anchored = tot_captioned = 0

    for fname in files:
        raw = json.load(open(os.path.join(RAW_DIR, fname)))
        src = raw.get("_source", {})
        slug = src.get("slug") or fname[:-5]

        figures_in = raw.get("figures") or []
        by_id = {f.get("id"): f for f in figures_in if f.get("id")}
        blocks = build_blocks(raw.get("pages_blocks"), set(by_id))
        chunks = chunk_blocks(blocks, slug)

        fig_dir = os.path.join(FIG_DIR, slug)
        os.makedirs(fig_dir, exist_ok=True)

        figures = []
        for i, b in enumerate(blocks):
            if b["kind"] != "figure":
                continue
            src_fig = by_id.get(b["figureId"])
            if not src_fig:
                continue
            fname_png = f"{b['figureId']}.png"
            b64 = src_fig.get("image_b64") or ""
            if b64:
                with open(os.path.join(fig_dir, fname_png), "wb") as fh:
                    fh.write(base64.b64decode(b64))
            bbox = src_fig.get("bbox") or [0, 0, 1, 1]
            figures.append(
                {
                    "id": f"{slug}::{b['figureId']}",
                    "docSlug": slug,
                    "page": b["page"],
                    "assetFile": os.path.join(slug, fname_png),
                    "bbox": bbox,
                    "area": max(0.0, bbox[2] - bbox[0]) * max(0.0, bbox[3] - bbox[1]),
                    # The sidecar already rejects ornaments, whole-page crops and
                    # text-heavy regions, so no second geometric filter is applied
                    # here. Adding one would double-filter and make the two
                    # extraction paths even less comparable.
                    "decorative": False,
                    "anchorIndex": b["index"],
                    "ctx": context_for(blocks, i),
                    "caption": src_fig.get("caption") or printed_caption(blocks, i),
                    "anchorChunkId": chunk_for_anchor(chunks, b["index"]),
                }
            )

        doc = {
            "slug": slug,
            "title": src.get("title") or slug,
            "pageCount": raw.get("pages") or len(raw.get("pages_text") or []),
            "blocks": blocks,
            "chunks": chunks,
            "figures": figures,
        }
        with open(os.path.join(OUT_DIR, slug + ".json"), "w") as fh:
            json.dump(doc, fh)

        anchored = sum(1 for f in figures if f["anchorChunkId"])
        captioned = sum(1 for f in figures if f["caption"])
        tot_figs += len(figures)
        tot_anchored += anchored
        tot_captioned += captioned
        print(
            f"[ugm-build] {slug}: {len(blocks)} blocks, {len(chunks)} chunks, "
            f"{len(figures)} figures ({captioned} captioned, {anchored} anchored)",
            flush=True,
        )

    pct = lambda n: (100.0 * n / tot_figs) if tot_figs else 0.0
    print(
        f"[ugm-build] corpus: {len(files)} docs, {tot_figs} figures — "
        f"printed caption {tot_captioned} ({pct(tot_captioned):.1f}%), "
        f"anchored {tot_anchored} ({pct(tot_anchored):.1f}%)",
        flush=True,
    )


if __name__ == "__main__":
    main()
