# MinerU sidecar — live hot-patch on the UGM box (2026-08-06)

## Revision 2 (2026-08-07)

`pages_blocks` now carries **MinerU's own block type** on every entry, and
caption blocks are no longer dropped.

- before: 16,195 bytes, sha256 `a0de95f4…`, backup `/app/server.py.bak-20260807`
- after: 17,592 bytes, sha256 `7cb62215…`

Revision 1 collapsed `text` / `title` / `list` / `footnote` / `footer` /
`page_number` / `index` into a single `"text"` kind and dropped caption blocks
entirely — the same discard this whole change exists to prevent, one layer down.
Three things the consumer could not recover afterwards:

- page numbers and running footers were chunked as if they were content,
  polluting the embeddings
- headings were invisible, so chunks could not be cut at section boundaries and
  split mid-topic instead
- captions vanished from the reading order

All three degrade retrieval, which is the measured bottleneck: only **51.8%** of
gold-bearing questions retrieve the chunk holding their figure at all. Block
types are the cheapest available lever on that number.

Emitted shape per block: `{"kind": "text"|"caption"|"figure", "type": "<mineru
type>", "text": …}` — additive, so revision-1 consumers still work.

**Existing extractions do not have this.** Re-extraction is required to benefit.

## What changed (revision 1)

`/app/server.py` inside the running `rantai-agents-mineru-1` container was
replaced with the current repo version of `portainer/build-mineru/server.py`.

- **before:** 13,641 bytes, dated 31 Jul, sha256 `22df81d5…`
- **after:** 16,195 bytes, sha256 `a0de95f4…` (identical to the repo file)
- **backup:** `/app/server.py.bak-20260806` inside the container

This was a **file swap plus container restart**, not an image rebuild. The image
is still `shirologic/mineru-server:gb10`, so **the change does not survive a
`docker compose pull`/recreate** — the stack will silently revert to the July
build. Rebuilding and pushing the arm64 image is still required to make it
permanent.

## Why

The deployed build returned `pages_text` (per-page markdown) and a separate
`figures[]` array with nothing linking them — the exact "reading order gets
discarded at ingest" problem the IKAT-Bench work is about. Without a link, a
figure is only ever locatable to "somewhere on page N", and placement has to be
re-guessed from captions at query time.

The repo version adds `pages_blocks`: a per-page reading-order block sequence
with each surviving figure emitted inline as `{"kind":"figure","id":"p<page>-b<idx>"}`,
plus `id` and `block_index` on every entry in `figures[]`. It is emitted
*alongside* the existing fields, so current consumers are unaffected.

The gap was larger than the anchor work alone: the deployed file predates several
figure-filtering commits (ornamental/whole-page crop rejection, colourfulness
filter, page-region crops containing many text blocks, `pages_text`). Those come
along with this swap, which means **figure extraction behaviour changes for UGM's
own users too** — fewer junk crops, which is the intent of those commits, but it
is a behavioural change on a production service and should be spot-checked.

## Verification done before swapping

1. Uploaded to `/app/server.py.new` first, leaving the live file untouched.
2. `ast.parse` — parses OK.
3. All 12 top-level imports resolved inside the container (`MISSING: none`).
4. `pages_blocks` present (5 occurrences), `block_index` present (6).
5. Only then: backup, swap, restart.

## Rollback

```sh
# inside the container
cp /app/server.py.bak-20260806 /app/server.py
# then restart the container
```

Or simply recreate the container from the image, which restores the July build.

## Still to do

- Rebuild `shirologic/mineru-server:gb10` (arm64, on the GB10 box) from
  `portainer/build-mineru/` so the change is durable.
- Spot-check UGM's own figure extraction after the filter changes.
