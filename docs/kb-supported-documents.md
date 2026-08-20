# What the knowledge base does with each kind of document

Every file gets chunked and embedded. What differs is the **extra** work, and
the difference is decided per file type — not by a toggle a user has to
understand. This page is the contract: what happens, what does not, and why.

The decision table lives in `src/lib/ingest/pipeline-policy.ts`; this document
explains it. If the two disagree, the code is right and this page is a bug.

## The short version

| You upload | Text is searchable | Figures cropped | Knowledge graph |
|---|---|---|---|
| **PDF** | yes | yes (see below) | yes |
| **Word, PowerPoint, Markdown, TXT, HTML** | yes | no | yes |
| **Excel, CSV, TSV, JSON, JSONL** | yes | no | no |
| **Source code, YAML, TOML, logs** | yes | no | no |
| **Images** (PNG, JPG, WEBP, HEIC…) | yes, via OCR | n/a — the file *is* the image | no |
| **3D models** (GLTF, GLB) | metadata only | no | no |

"Knowledge graph" is the LLM entity/relation extraction step. It is switched
off wherever it would be noise: a spreadsheet's entities are its column values,
a log file's are timestamps, and extracting them costs a model call per chunk
to make retrieval worse.

## PDFs, and the only knob you have

PDFs are the only type with a user-facing choice, `figureMode`:

- **`auto`** (default) — if the PDF has a usable text layer, read it directly;
  that is fast and exact. If it does not, fall back to the layout parser.
- **`force`** — always run the layout parser, even when a text layer exists.
- **`skip`** — never crop figures; text only.

**`auto` does not produce figures for a text-layer PDF.** That is the single
most surprising thing on this page, so it is worth stating plainly: a
born-digital textbook full of diagrams, uploaded on the default setting, will
be searchable as text and will contain **no figures at all** — because the fast
path never opens the pages as images. Choose `force` for anything whose
pictures matter. The partner deployment learned this the hard way: 91% of its
figure corpus had been ingested on `auto` and carried no anchors, so the figure
join could never fire.

Use `skip` when a PDF is a wall of text (a policy document, a contract) — it
saves the layout pass, which is the slowest step in ingestion.

## Spreadsheets are not documents with pictures

Excel and CSV take a deliberately different route. There is no figure step —
there are no figures in a spreadsheet — and no entity extraction. What they do
get is the table-aware chunker, which keeps a row intact with its header
instead of splitting mid-record. That one change was the largest single
improvement to table question-answering we measured; the naive splitter used to
shred rows across chunk boundaries, so a question about one row retrieved half
of it and half of its neighbour.

If a spreadsheet ingest looks slow, it is not doing OCR — it is embedding, and
a wide sheet is a lot of rows.

## Images

An uploaded image is OCR'd for its text and stored as its own asset. There is
no "figure extraction" step because the file is already the figure. Entity
extraction is off: OCR output is noisy enough that graph edges built from it
are mostly wrong.

## What is not supported

Anything not in the table above is rejected at upload rather than half-ingested
— video, audio, archives, and binaries. A file that cannot become text cannot
become an answer, and storing it silently would only make the KB look like it
knows something it does not.

## Practical guidance

- **Textbooks and manuals with diagrams** → PDF, `figureMode: force`.
- **Reports and contracts, text only** → PDF, `figureMode: skip` (faster).
- **Data exports** → CSV or XLSX rather than a PDF *of* a table. The table-aware
  chunker can only help when the rows are still rows.
- **Scanned documents** → any figureMode; the layout path runs regardless,
  because there is no text layer to take the fast route through.
