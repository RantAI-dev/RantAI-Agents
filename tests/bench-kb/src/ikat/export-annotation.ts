/**
 * IKAT-Bench — build a human annotation task for figure selection.
 *
 * Every selection number we have is scored against a gold standard that is 80%
 * anchor-derived (see docs/paper/06-gold-standard-confound.md), and the 20% that
 * is not carries the opposite bias. No amount of further analysis fixes that;
 * the only way out is a gold standard produced by people who saw neither
 * mechanism.
 *
 * So the annotator sees the QUESTION and the CANDIDATE IMAGES, and nothing else:
 *
 *   - no anchor, no reading-order position, no page number
 *   - no VLM description and no printed caption
 *   - candidates shuffled per item under a fixed seed, so neither the anchored
 *     figure nor the top description match sits in a predictable slot
 *   - "none of these" is offered first, because a task that only allows picking
 *     manufactures agreement — and 53% of our questions genuinely have no
 *     correct figure
 *
 * Sampling is stratified over books and over question type. Without that, the
 * 65/35 split between passage questions and figure-dependent ones would carry
 * straight into the annotation and reproduce the imbalance we are trying to
 * measure our way out of.
 *
 * Output is a single self-contained HTML file with the crops inlined, so it can
 * be emailed and opened offline. It writes a JSON blob the annotator downloads
 * at the end; score-annotation reads that back.
 *
 * Usage:
 *   IKAT_CORPUS=ugm3-built bun tests/bench-kb/src/ikat/export-annotation.ts [items] [candidates]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { shuffle } from "../judge"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const CORPUS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "ugm3-built")
const FIG_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_FIGURES ?? "ugm3-figures")
const QFILE = path.join(BENCH_ROOT, "corpus", process.env.IKAT_QUESTIONS ?? "questions-ugm-large.json")
const OUT = path.join(BENCH_ROOT, "corpus", "annotation")
const SEED = 20260810

interface Q { id: string; question: string; docSlug: string; goldFigureIds: string[]; type: string }

function main() {
  const nItems = parseInt(process.argv[2] ?? "60", 10)
  const nCand = parseInt(process.argv[3] ?? "8", 10)

  const questions = JSON.parse(fs.readFileSync(QFILE, "utf-8")) as Q[]
  const docs = new Map<string, any>()
  for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), "utf-8"))
    docs.set(d.slug, d)
  }

  // Stratify: equal share per book, and within a book keep the figure-dependent
  // and passage questions balanced rather than sampling the natural 35/65.
  const perBook = Math.max(1, Math.floor(nItems / docs.size))
  const picked: Q[] = []
  for (const slug of [...docs.keys()].sort()) {
    const dq = questions.filter((q) => q.docSlug === slug)
    const fig = shuffle(dq.filter((q) => q.type === "figure_dependent"), SEED)
    const other = shuffle(dq.filter((q) => q.type !== "figure_dependent"), SEED + 1)
    for (let i = 0; i < perBook; i++) {
      const q = i % 2 === 0 ? fig[Math.floor(i / 2)] : other[Math.floor(i / 2)]
      if (q) picked.push(q)
    }
  }

  const items: any[] = []
  const key: any[] = []
  for (const [i, q] of picked.slice(0, nItems).entries()) {
    const doc = docs.get(q.docSlug)
    if (!doc) continue
    const usable = (doc.figures ?? []).filter((f: any) => !f.decorative)
    if (usable.length < 2) continue

    // Candidates: the gold figures plus a random draw from the same book, so a
    // correct answer is present but never identifiable by position. Drawing
    // distractors from the SAME book matters — cross-book distractors would be
    // trivially rejectable and the task would flatter every system.
    const gold = new Set(q.goldFigureIds ?? [])
    const others = shuffle(usable.filter((f: any) => !gold.has(f.id)), SEED + i)
    const chosen = [...usable.filter((f: any) => gold.has(f.id)), ...others].slice(0, nCand)
    const shown = shuffle(chosen, SEED + 1000 + i)

    // Written as files rather than inlined. Inlining 8 full-resolution crops per
    // item produced an 81 MB page that could not be emailed; the images are
    // downscaled after export and only then folded into a self-contained file.
    const imgs: string[] = []
    for (const [j, f] of shown.entries()) {
      const src = path.join(FIG_DIR, q.docSlug, path.basename(f.assetFile ?? ""))
      if (!fs.existsSync(src)) { imgs.push(""); continue }
      const name = `i${items.length + 1}-${j}.png`
      fs.mkdirSync(path.join(OUT, "images"), { recursive: true })
      fs.copyFileSync(src, path.join(OUT, "images", name))
      imgs.push(`images/${name}`)
    }
    if (imgs.some((x) => !x)) continue

    items.push({ item: items.length + 1, question: q.question, images: imgs })
    key.push({
      item: items.length,
      questionId: q.id,
      docSlug: q.docSlug,
      type: q.type,
      // Recorded for scoring only. The annotator never sees this file.
      shownFigureIds: shown.map((f: any) => f.id),
      harnessGold: [...gold],
    })
  }

  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, "annotation.KEY.json"), JSON.stringify(key, null, 2))

  const html = `<!doctype html><meta charset="utf-8"><title>Anotasi Gambar — IKAT</title>
<style>
body{font:16px/1.6 system-ui,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#111}
.item{border-top:2px solid #ddd;padding:2rem 0}
.q{font-size:1.2rem;font-weight:600;background:#f6f8fa;padding:1rem;border-radius:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-top:1rem}
label{display:block;border:2px solid #ddd;border-radius:8px;padding:.5rem;cursor:pointer}
label:has(input:checked){border-color:#0a7;background:#eafaf4}
img{width:100%;height:180px;object-fit:contain;background:#fff}
.none{margin-top:1rem;padding:.75rem;border:2px dashed #c33;border-radius:8px;background:#fff5f5}
button{font-size:1.1rem;padding:.8rem 1.5rem;border-radius:8px;border:0;background:#0a7;color:#fff;cursor:pointer}
.hdr{background:#fffbe6;border:1px solid #e5c07b;padding:1rem;border-radius:8px}
</style>
<h1>Anotasi: gambar mana yang cocok?</h1>
<div class="hdr">
<p><b>Tugas:</b> untuk setiap pertanyaan, pilih gambar yang benar-benar <b>membantu menjawab</b> pertanyaan itu.</p>
<ul>
<li>Boleh memilih lebih dari satu, atau <b>tidak sama sekali</b>.</li>
<li>Banyak pertanyaan memang <b>tidak butuh gambar</b> — memilih "tidak ada" adalah jawaban yang benar dan sering.</li>
<li>Nilai gambar dari isinya, bukan dari keindahannya. Gambar hiasan yang tidak mengajarkan apa pun jangan dipilih.</li>
<li>Jika ragu, jangan dipilih.</li>
</ul>
<p>Setelah selesai, tekan tombol di bawah dan kirimkan berkas yang terunduh.</p>
</div>
<div id="items"></div>
<p><button onclick="save()">Simpan jawaban</button></p>
<script>
const ITEMS=${JSON.stringify(items)};
const root=document.getElementById('items');
ITEMS.forEach(it=>{
  const d=document.createElement('div');d.className='item';
  d.innerHTML='<div class="q">'+it.item+'. '+it.question+'</div>'+
    '<div class="none"><label><input type="checkbox" name="none'+it.item+'"> Tidak ada gambar yang cocok</label></div>'+
    '<div class="grid">'+it.images.map((src,j)=>
      '<label><input type="checkbox" name="i'+it.item+'" value="'+j+'"><img src="'+src+'"></label>').join('')+'</div>';
  root.appendChild(d);
});
function save(){
  const out=ITEMS.map(it=>({item:it.item,
    none:document.querySelector('[name=none'+it.item+']').checked,
    picked:[...document.querySelectorAll('[name=i'+it.item+']:checked')].map(x=>+x.value)}));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));
  a.download='annotation-answers.json';a.click();
}
</script>`
  const file = path.join(OUT, "annotation.html")
  fs.writeFileSync(file, html)
  const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1)
  console.log(`[ikat] ${items.length} items, ${nCand} candidates each -> ${file} (${mb} MB)`)
  console.log(`[ikat] key withheld at annotation.KEY.json — do NOT send it to annotators`)
  const byType: Record<string, number> = {}
  for (const k of key) byType[k.type] = (byType[k.type] ?? 0) + 1
  console.log(`[ikat] stratification: ${JSON.stringify(byType)}`)
}

if (import.meta.main) main()
