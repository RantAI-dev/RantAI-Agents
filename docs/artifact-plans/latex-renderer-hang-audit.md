# LaTeX Renderer Hang — Audit (`text/latex` artifact panel)

**Tanggal:** 2026-05-04
**File:** `src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx`
**Gejala:** Browser memunculkan dialog **"Page Unresponsive — Wait / Kill"** saat artifact panel membuka konten `text/latex` tertentu.
**Root cause:** **Infinite loop di main thread** pada parser block-level `latexToHtml`. Bukan crash KaTeX, bukan masalah memori — murni `while` loop tanpa increment counter di dua jalur kode.

---

## Bug #1 — Single-line `$$...$$` → infinite loop

**Lokasi:** `latex-renderer.tsx:386-406`

```js
if (line.startsWith("$$")) {
  if (inList) { parts.push(`</${listType}>`); inList = false }
  let mathContent = line.slice(2)
  if (mathContent.endsWith("$$")) {
    mathContent = mathContent.slice(0, -2)
    //  ↑↑↑ branch ini TIDAK pernah `i++`
  } else {
    i++
    while (i < lines.length && !lines[i].includes("$$")) {
      mathContent += "\n" + lines[i]
      i++
    }
    if (i < lines.length) {
      mathContent += "\n" + lines[i].replace("$$", "")
      i++
    }
  }
  parts.push(`<div class="math-block">${renderMath(mathContent.trim(), true)}</div>`)
  continue   //  ← kembali ke outer while, i tetap sama → loop forever
}
```

### Trace dengan input `lines = ["$$x = y$$"]`, i = 0

| Iter | i | line             | Action                                   | i setelah |
|------|---|------------------|------------------------------------------|-----------|
| 1    | 0 | `$$x = y$$`      | startsWith TRUE → endsWith TRUE → push   | **0**     |
| 2    | 0 | `$$x = y$$`      | sama persis                              | **0**     |
| ∞    | 0 | …                | hang main thread                         | 0         |

Outer `while` memeriksa `i < lines.length`, tapi `i` tidak pernah berubah. CPU 100%, browser muncul prompt "Wait / Kill".

### Reproduksi

Konten artifact apa pun yang berisi:

```latex
$$x^2 + y^2 = z^2$$
```

di satu baris akan menggantung panel. Pola ini **sangat umum** di output LLM, terutama untuk persamaan pendek inline.

---

## Bug #2 — Single-line `\[...\]` → infinite loop (sama persis)

**Lokasi:** `latex-renderer.tsx:363-383`

```js
if (line.startsWith("\\[")) {
  if (inList) { parts.push(`</${listType}>`); inList = false }
  let mathContent = line.replace("\\[", "")
  if (mathContent.includes("\\]")) {
    mathContent = mathContent.replace("\\]", "")
    //  ↑↑↑ branch ini TIDAK pernah `i++`
  } else {
    // ... (else branch DOES advance i correctly)
  }
  parts.push(...)
  continue   //  ← infinite loop, sama dengan Bug #1
}
```

### Reproduksi

```latex
\[ E = mc^2 \]
```

di satu baris akan menggantung panel.

---

## Mengapa ini lolos sampai sekarang

1. **Tiga `examples` di `prompts/artifacts/latex.ts` semuanya menggunakan pola multi-line:**

   ```latex
   $$
   \sqrt{2} = \frac{a}{b}, \qquad \gcd(a, b) = 1.
   $$
   ```

   Pola multi-line ini masuk ke **else branch** yang advance `i` dengan benar.

2. **LLM yang dilatih dengan contoh tersebut akan cenderung mengikuti pola multi-line** — sehingga bug ini jarang terpicu di artifact yang dibuat lewat tool `create_artifact`.

3. **Tapi user yang paste konten LaTeX dari sumber lain** (Stack Exchange, ChatGPT lain, paper, lecture notes) sering memakai `$$x = y$$` satu baris — itu yang memicu hang.

4. **Tidak ada `try/catch` atau timeout di `latexToHtml`** — `useMemo` yang membungkusnya hanya menangkap exception, bukan infinite loop. Main thread tergantung sampai user pilih "Kill page".

---

## Fix yang direkomendasikan

**Patch minimal** — tambahkan `i++` di kedua single-line branch. Diff lengkap:

```diff
   if (line.startsWith("\\[")) {
     if (inList) { parts.push(`</${listType}>`); inList = false }
     let mathContent = line.replace("\\[", "")
     if (mathContent.includes("\\]")) {
       mathContent = mathContent.replace("\\]", "")
+      i++
     } else {
       i++
       while (i < lines.length && !lines[i].includes("\\]")) {
         mathContent += "\n" + lines[i]
         i++
       }
       if (i < lines.length) {
         mathContent += "\n" + lines[i].replace("\\]", "")
         i++
       }
     }
     parts.push(...)
     continue
   }

   if (line.startsWith("$$")) {
     if (inList) { parts.push(`</${listType}>`); inList = false }
     let mathContent = line.slice(2)
     if (mathContent.endsWith("$$")) {
       mathContent = mathContent.slice(0, -2)
+      i++
     } else {
       i++
       // ... rest unchanged
     }
     parts.push(...)
     continue
   }
```

Total: **2 baris ditambahkan**. Tidak ada perubahan API, tidak ada perubahan output untuk konten yang sudah bekerja.

---

## Hardening tambahan (opsional, layered defense)

Bug serupa bisa muncul di branch lain di masa depan. Tambahkan **safety belt** di outer loop:

```js
const lines = body.split("\n")
let i = 0
let lastI = -1     // ← guard
let inList = false
let listType: "ul" | "ol" = "ul"

while (i < lines.length) {
  if (i === lastI) {
    // bug — ada branch yang tidak advance i. Skip line ini paksa.
    if (process.env.NODE_ENV !== "production") {
      console.error(`latex-renderer: no progress at line ${i}: ${lines[i]}`)
    }
    i++
    continue
  }
  lastI = i
  // ... existing branches ...
}
```

Ini bukan pengganti fix utama — ini **fail-safe** supaya bug serupa berikutnya tidak menggantung browser, hanya kehilangan satu baris render.

---

## Test coverage gap

Tidak ada unit test untuk `latexToHtml`. Setelah fix, tambahkan minimal:

```ts
describe("latexToHtml", () => {
  it("renders single-line $$...$$ without hanging", () => {
    const result = latexToHtml("$$x = y$$")
    expect(result).toContain("math-block")
  })

  it("renders single-line \\[...\\] without hanging", () => {
    const result = latexToHtml("\\[E = mc^2\\]")
    expect(result).toContain("math-block")
  })
})
```

Test ini akan **timeout** di kondisi sekarang — bukti bug.

---

## Audit areas lain yang aman

Saya juga periksa branch lain di `latexToHtml` — semuanya advance `i` dengan benar:

| Branch | Lokasi | i advance? |
|--------|--------|-----------|
| Empty line skip | L256-259 | ✓ |
| Preamble skip | L262-274 | ✓ |
| `\section` / `\subsection` / `\subsubsection` | L279-294 | ✓ |
| `\begin{itemize}` / `\begin{enumerate}` | L297-312 | ✓ |
| `\end{itemize}` / `\end{enumerate}` | L315-325 | ✓ |
| `\item` | L328-338 | ✓ |
| `\begin{equation/align/gather/...}` block | L340-360 | ✓ |
| `\[...\]` **multi-line** | L369-378 (else branch) | ✓ |
| `\[...\]` **single-line** | L366-368 | ✗ **BUG** |
| `$$...$$` **multi-line** | L391-400 (else branch) | ✓ |
| `$$...$$` **single-line** | L388-390 | ✗ **BUG** |
| `\begin{quote}` / `\begin{abstract}` | L409-423 | ✓ |
| Generic `\begin{...}` / `\end{...}` skip | L426-429 | ✓ |
| `\paragraph{...}` | L432-440 | ✓ |
| Regular text paragraph | L449-461 | ✓ |

Hanya 2 branch yang bocor — keduanya symmetric (single-line display math).

---

## Severity & priority

- **User impact:** **HIGH** — page hang adalah pengalaman terburuk yang mungkin dialami user di canvas. "Kill page" prompt dari browser bukan recoverable error.
- **Trigger frequency:** **MEDIUM-HIGH** — single-line `$$...$$` adalah pola umum di sumber LaTeX manapun di luar prompt examples kita.
- **Fix complexity:** **TRIVIAL** — 2 baris.
- **Risk regression:** **NONE** — branch yang dipatch hanya menambah `i++` setelah selesai memproses baris.

**Rekomendasi:** patch sekarang juga, sebelum kerja perbaikan LaTeX yang lain (theorem environments, dll). Dua baris.
