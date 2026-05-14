/**
 * Generate a candidate golden set seed from documents in the current DB.
 *
 * Usage:
 *   bun scripts/eval-rag/generate-candidates.ts [groupId...]
 *
 * For each document in the bound groups (or all if no groupId given), emits
 * three query candidates:
 *   - "lookup":     "What is <title>?"
 *   - "lookup":     "Jelaskan <title>" (Indonesian — most users here)
 *   - "followup":   "tell me more about it" with priorTurns referencing the doc
 *
 * Plus one "enumerate" candidate per group:
 *   - "list all documents in <group name>"
 *   - "berapa total dokumen di <group name>"
 *
 * Plus a small fixed set of "oos" candidates that no realistic KB should
 * answer (used to confirm the model refuses cleanly).
 *
 * Output: tests/fixtures/rag-golden-seed.json
 *
 * The human reviewer then trims, annotates with expectedDocs/expectedRefusal,
 * and promotes the file to rag-golden.json. Re-running this script overwrites
 * the seed but never touches the curated file.
 */

import * as dotenv from "dotenv"
dotenv.config()

import * as fs from "fs"
import * as path from "path"
import { prisma } from "../../src/lib/prisma"
import type { GoldenEntry, GoldenSet } from "./lib/types"

const OUT_PATH = path.join(process.cwd(), "tests", "fixtures", "rag-golden-seed.json")

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

async function main() {
  const argGroupIds = process.argv.slice(2)
  console.log(
    argGroupIds.length
      ? `[eval-rag] generating candidates for groups: ${argGroupIds.join(", ")}`
      : "[eval-rag] generating candidates across all groups"
  )

  const docs = await prisma.document.findMany({
    where: argGroupIds.length
      ? { groups: { some: { groupId: { in: argGroupIds } } } }
      : undefined,
    select: {
      id: true,
      title: true,
      categories: true,
      subcategory: true,
      groups: { select: { group: { select: { id: true, name: true } } } },
    },
    orderBy: { title: "asc" },
  })

  if (!docs.length) {
    console.error("[eval-rag] no documents found; check group ids or run after seeding the KB")
    process.exit(1)
  }

  const groupMap = new Map<string, { id: string; name: string }>()
  for (const d of docs) {
    for (const dg of d.groups) groupMap.set(dg.group.id, dg.group)
  }

  const entries: GoldenEntry[] = []

  // Per-doc lookup candidates
  for (const d of docs) {
    const groupIds = d.groups.map((g) => g.group.id)
    entries.push({
      id: `lookup-en-${slugify(d.title)}`,
      query: `What is ${d.title}?`,
      kind: "lookup",
      expectedDocs: [d.title],
      knowledgeBaseGroupIds: groupIds,
      notes: "auto-generated; trim / refine expected behavior before promoting",
    })
    entries.push({
      id: `lookup-id-${slugify(d.title)}`,
      query: `Jelaskan ${d.title}`,
      kind: "lookup",
      expectedDocs: [d.title],
      knowledgeBaseGroupIds: groupIds,
    })
    entries.push({
      id: `followup-${slugify(d.title)}`,
      query: "tell me more about it",
      kind: "followup",
      expectedDocs: [d.title],
      knowledgeBaseGroupIds: groupIds,
      priorTurns: [
        { role: "user", content: `What is ${d.title}?` },
        { role: "assistant", content: `<assistant explained ${d.title}>` },
      ],
      notes: "tests standalone-query rewrite for vague pronoun resolution",
    })
  }

  // Per-group enumerate candidates
  for (const group of groupMap.values()) {
    entries.push({
      id: `enumerate-en-${slugify(group.name)}`,
      query: `List all documents in ${group.name}`,
      kind: "enumerate",
      expectedDocs: [], // user fills with full doc list when curating
      knowledgeBaseGroupIds: [group.id],
      notes: "tests directory-injection fix; expectedDocs should list every doc in the group",
    })
    entries.push({
      id: `enumerate-id-${slugify(group.name)}`,
      query: `Sebutkan semua dokumen di ${group.name}`,
      kind: "enumerate",
      expectedDocs: [],
      knowledgeBaseGroupIds: [group.id],
    })
  }

  // Out-of-scope canaries (model should refuse)
  const oos: Array<Pick<GoldenEntry, "id" | "query">> = [
    { id: "oos-weather", query: "Bagaimana cuaca di Jakarta besok?" },
    { id: "oos-recipe", query: "Resep nasi goreng yang enak?" },
    { id: "oos-celebrity", query: "Siapa pacar BTS Jungkook?" },
  ]
  for (const o of oos) {
    entries.push({
      id: o.id,
      query: o.query,
      kind: "oos",
      expectedDocs: [],
      expectedRefusal: true,
      notes: "model should refuse cleanly via the not-in-KB instruction",
    })
  }

  const set: GoldenSet = {
    name: "rag-golden-seed",
    version: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
    defaultGroupIds: argGroupIds.length ? argGroupIds : undefined,
    entries,
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(set, null, 2))
  console.log(`[eval-rag] wrote ${entries.length} candidates to ${OUT_PATH}`)
  console.log(
    "[eval-rag] next steps:\n" +
    "  1. open the seed file, trim entries you don't care about\n" +
    "  2. fill in expectedDocs for enumerate entries (the full list per group)\n" +
    "  3. promote to tests/fixtures/rag-golden.json when ready\n" +
    "  4. run: bun scripts/eval-rag/run.ts"
  )

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error("[eval-rag] generate failed:", err)
  process.exit(1)
})
