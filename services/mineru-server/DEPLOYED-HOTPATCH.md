# MinerU sidecar — hot-patch, then the rebuild that made it durable

## Resolved (2026-08-13): baked into the image

`shirologic/mineru-server:gb10-blocks` (arm64) now contains revision 2 at build
time. UGM stack 28 runs it.

The warning below was not hypothetical — **the hot-patch was already gone.** By
the time this was checked, the live `/app/server.py` was 7003 bytes with zero
occurrences of `pages_blocks` or `block_index`, and both `.bak-*` backups had
vanished with the container that held them. The sidecar had been silently back
on an anchor-incapable build for an unknown period, which is why UGM's 12,466
figure chunks carry no `anchorChunkIndex` at all: re-ingesting would not have
helped, because the extractor was not producing reading order to anchor to.

Verified on the box after deploying the rebuilt image:

- `/app/server.py` is 17,592 bytes, sha256 `7cb62215…` — byte-identical to this repo
- `pages_blocks` ×5, `block_index` ×6
- vLLM engine loads on arm64 Blackwell at the default `MINERU_MEM_UTIL=0.25`
  (the 0.38 used during earlier experiments turned out not to be needed)
- `POST /extract` with `structured=true` returns
  `pages_blocks: [[{"kind":"text","type":"title","text":…}]]` — block **type**
  present, which is revision 2's addition
- warm single-page extraction: 272 ms (first call 146 s, engine load)

Still unproven: figure cropping and inline figure placement on a real textbook
page. The verification PDF carries no figures.

## Revision 2 (2026-08-07) — original hot-patch record

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

- ~~Rebuild the image so the change is durable.~~ Done 2026-08-13, see top.
- Spot-check UGM's own figure extraction after the filter changes — still open,
  and best done on the first re-ingested book rather than in the abstract.
- `dpi` is a per-request field defaulting to 300 and the Node extractor does not
  send one, so the 180 used during the GB10 experiments is NOT in effect. Whether
  300 is a problem on dense textbook pages is untested; watch the first book.
