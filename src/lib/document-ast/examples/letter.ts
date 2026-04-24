import type { DocumentAst } from "@/lib/document-ast/schema"

/**
 * Golden fixture: Project Kickoff Confirmation Letter
 * Sender: NQ Technology Solutions  →  Recipient: PT Mitra Sejahtera
 * Document number: LTR/NQT/2026/045  |  Date: 2026-04-23
 *
 * Used as:
 *   1. CI test input for the validator and exporter (minimal — no TOC/list/table)
 *   2. Prompt example for the LLM document generator (formal letter style)
 */
export const letterExample: DocumentAst = {
  // ──────────────────────────────────────────────
  // Meta
  // ──────────────────────────────────────────────
  meta: {
    title: "Project Kickoff Confirmation Letter",
    author: "NQ Technology Solutions",
    organization: "NQ Technology",
    documentNumber: "LTR/NQT/2026/045",
    date: "2026-04-23",
    pageSize: "letter",
    showPageNumbers: false,
    font: "Times New Roman",
    fontSize: 12,
  },

  // ──────────────────────────────────────────────
  // Header — letterhead (sender name left, address right)
  // ──────────────────────────────────────────────
  header: {
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", text: "NQ Technology Solutions", bold: true },
          { type: "tab", leader: "none" },
          { type: "tab", leader: "none" },
          { type: "text", text: "Jl. Sudirman No. 88, Jakarta 10220, Indonesia", italic: true },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────
  // Body
  // ──────────────────────────────────────────────
  body: [
    // ── Date line (right-aligned) ─────────────────
    {
      type: "paragraph",
      align: "right",
      children: [
        { type: "text", text: "Jakarta, 23 April 2026" },
      ],
    },

    // ── Recipient block ───────────────────────────
    {
      type: "paragraph",
      spacing: { before: 280, after: 0 },
      children: [
        { type: "text", text: "Bapak Darmawan Santoso", bold: true },
      ],
    },
    {
      type: "paragraph",
      spacing: { before: 0, after: 0 },
      children: [
        { type: "text", text: "Direktur Operasional" },
      ],
    },
    {
      type: "paragraph",
      spacing: { before: 0, after: 240 },
      children: [
        { type: "text", text: "PT Mitra Sejahtera, Jl. Gatot Subroto No. 12, Jakarta 12930" },
      ],
    },

    // ── Salutation ────────────────────────────────
    {
      type: "paragraph",
      children: [
        { type: "text", text: "Dengan hormat," },
      ],
    },

    // ── Body paragraph 1 ─────────────────────────
    {
      type: "paragraph",
      indent: { firstLine: 720 },
      children: [
        {
          type: "text",
          text:
            "Sehubungan dengan penandatanganan kontrak pengembangan sistem antara PT Mitra " +
            "Sejahtera dan NQ Technology Solutions pada tanggal 18 April 2026, dengan hormat " +
            "kami sampaikan bahwa proyek integrasi platform digital tahap pertama secara resmi " +
            "akan dimulai pada tanggal 2 Mei 2026.",
        },
      ],
    },

    // ── Body paragraph 2 ─────────────────────────
    {
      type: "paragraph",
      indent: { firstLine: 720 },
      children: [
        {
          type: "text",
          text:
            "Pertemuan kickoff akan diadakan pada Kamis, 2 Mei 2026, pukul 09.00–11.00 WIB, " +
            "bertempat di ruang konferensi lantai 5 gedung PT Mitra Sejahtera. Agenda pertemuan " +
            "meliputi: pemaparan ruang lingkup proyek, pengenalan tim proyek dari kedua belah pihak, " +
            "penetapan milestone utama, serta pembahasan risiko dan mitigasinya.",
        },
      ],
    },

    // ── Body paragraph 3 ─────────────────────────
    {
      type: "paragraph",
      indent: { firstLine: 720 },
      children: [
        {
          type: "text",
          text:
            "Kami mohon konfirmasi kehadiran Bapak beserta perwakilan tim teknis dan keuangan " +
            "PT Mitra Sejahtera selambat-lambatnya pada 28 April 2026. Informasi lebih lanjut " +
            "mengenai agenda lengkap dan daftar peserta yang diundang akan kami kirimkan terpisah " +
            "melalui surat elektronik kepada Bapak.",
        },
      ],
    },

    // ── Dot-leader reference line ─────────────────
    {
      type: "paragraph",
      spacing: { before: 280, after: 0 },
      children: [
        { type: "text", text: "Nomor dokumen" },
        { type: "tab", leader: "dot" },
        { type: "text", text: " LTR/NQT/2026/045" },
      ],
    },

    // ── Closing / Signature block ─────────────────
    {
      type: "paragraph",
      spacing: { before: 320, after: 0 },
      children: [
        { type: "text", text: "Hormat kami," },
      ],
    },
    {
      // blank spacer paragraph for signature gap
      type: "paragraph",
      spacing: { before: 0, after: 0 },
      children: [
        { type: "text", text: "" },
      ],
    },
    {
      type: "paragraph",
      spacing: { before: 0, after: 0 },
      children: [
        { type: "text", text: "Rizky Firmansyah", bold: true },
      ],
    },
    {
      type: "paragraph",
      spacing: { before: 0, after: 0 },
      children: [
        { type: "text", text: "Direktur Proyek & Kemitraan" },
      ],
    },
    {
      type: "paragraph",
      spacing: { before: 0, after: 0 },
      children: [
        { type: "text", text: "NQ Technology Solutions" },
      ],
    },
  ],
}
