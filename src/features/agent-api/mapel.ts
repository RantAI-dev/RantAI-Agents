/**
 * Per-subject selection and assistant knowledge-base scope on the v1 API
 * ("mapel" — mata pelajaran).
 *
 * An assistant is bound to a grade ("SMP Kelas 8") and reads that grade's
 * knowledge bases. The grade's subjects live underneath it as child groups named
 * `<Mapel> — Kelas <N>`, so an external frontend that only knows the subject
 * name ("IPA") has no id to send. This module turns the plain name into the ids
 * the retrieval path already understands.
 *
 * The naming form is a convention, not a schema field: a group is a subject iff
 * its name matches `^(.+?) — Kelas \d{1,2}$` with an em dash. "Arsip — Buku
 * Guru" contains the dash but names no grade, so it is not a subject.
 */
import { prisma } from "@/lib/prisma"

/** `<Mapel> — Kelas <N>`; the dash is U+2014 with single spaces around it. */
const MAPEL_NAME = /^(.+?) — Kelas \d{1,2}$/

/** The subject part of a grade-group name, or null when the name is not one. */
export function mapelFromGroupName(name: string): string | null {
  const match = MAPEL_NAME.exec(name.trim())
  if (!match) return null
  const mapel = match[1].trim()
  return mapel.length > 0 ? mapel : null
}

/** Case- and whitespace-insensitive form, for matching what a caller typed. */
export function normalizeMapel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

export interface MapelGroup {
  id: string
  name: string
  parentId: string | null
  documentCount: number
}

export interface AvailableMapel {
  mapel: string
  knowledge_base_id: string
  document_count: number
}

/**
 * The subjects a caller may ask for, given the groups the assistant is scoped
 * to.
 *
 * A candidate is a group in scope, or a child of one: a grade-8 assistant is
 * scoped to "SMP Kelas 8" and reaches "IPA — Kelas 8" through `parentId`, while
 * a grade-7 assistant is scoped to the per-subject groups directly. Groups with
 * no documents are dropped — offering a subject that would answer nothing only
 * moves the disappointment to the chat request.
 *
 * Two groups for the same subject (a stray duplicate, or a subject listed both
 * directly and under a parent) collapse to the populated one, so the list holds
 * one entry per subject.
 */
export function mapelGroupsFor(groups: MapelGroup[], scopeIds: string[]): AvailableMapel[] {
  const scope = new Set(scopeIds)
  const byMapel = new Map<string, AvailableMapel>()
  for (const g of groups) {
    const inScope = scope.has(g.id) || (g.parentId !== null && scope.has(g.parentId))
    if (!inScope) continue
    const mapel = mapelFromGroupName(g.name)
    if (!mapel || g.documentCount <= 0) continue
    const key = normalizeMapel(mapel)
    const previous = byMapel.get(key)
    if (!previous || g.documentCount > previous.document_count) {
      byMapel.set(key, { mapel, knowledge_base_id: g.id, document_count: g.documentCount })
    }
  }
  return [...byMapel.values()].sort((a, b) => a.mapel.localeCompare(b.mapel, "id"))
}

/**
 * Turn a requested subject name into the ids to retrieve from, or explain what
 * could be asked for instead.
 *
 * An unknown subject is an error rather than a fallback to every base: an
 * answer drawn from the biology book to a maths question is invisible to the
 * caller, while an error naming the valid subjects fixes itself.
 */
export function resolveMapel(
  available: AvailableMapel[],
  requested: string,
): { ids: string[] } | { error: string; available: string[] } {
  const wanted = normalizeMapel(requested)
  const hit = available.find((a) => normalizeMapel(a.mapel) === wanted)
  if (hit) return { ids: [hit.knowledge_base_id] }
  return {
    error: `Unknown mapel "${requested}" for this assistant. Call GET /api/v1/mapel for the list.`,
    available: available.map((a) => a.mapel),
  }
}

/** A knowledge-base group in the shape `assistantScopeGroups` returns. */
export interface AssistantScopeGroup {
  id: string
  name: string
  description: string | null
  parentId: string | null
  documentCount: number
}

/**
 * The knowledge-base groups an assistant may read — the security boundary
 * that `knowledge_base_ids` requests and `GET /api/v1/knowledge-bases` are
 * confined to.
 *
 * Why: grade isolation. Per the UGM PRD a student's grade decides the
 * available curriculum, and every UGM assistant is bound to one grade, so a
 * grade assistant must never read another grade's books. Verified live on
 * 2026-11-19: a Kelas 2 key could read Kelas 12 books by sending that
 * grade's group id in `knowledge_base_ids` (or `["*"]` for the whole
 * organisation), because the old rule only checked organisation membership.
 *
 * The scope is the assistant's configured `knowledgeBaseGroupIds` plus
 * those groups' direct children — a group whose `parentId` is in that set.
 * Kelas 7 assistants bind their per-subject groups directly; the other
 * grades bind the grade group and reach their subjects through it. The
 * query is the same shape `listMapelForAssistant` uses (same organisation
 * filter, same id/parentId OR), so subject selection and id filtering can
 * never disagree about what is reachable. Groups with no documents are
 * included here; mapel filters those out itself.
 *
 * The scope is computed ONLY from the authenticated key's assistant —
 * `organizationId` and `knowledgeBaseGroupIds` from the assistant record —
 * and never from request input: `knowledge_base_ids` can narrow inside the
 * scope, never widen it.
 */
export async function assistantScopeGroups(assistant: {
  organizationId: string | null
  knowledgeBaseGroupIds: string[]
}): Promise<AssistantScopeGroup[]> {
  const scopeIds = assistant.knowledgeBaseGroupIds
  if (scopeIds.length === 0) return []
  const groups = await prisma.knowledgeBaseGroup.findMany({
    where: {
      organizationId: assistant.organizationId,
      OR: [{ id: { in: scopeIds } }, { parentId: { in: scopeIds } }],
    },
    select: {
      id: true,
      name: true,
      description: true,
      parentId: true,
      _count: { select: { documents: true } },
    },
    orderBy: { name: "asc" },
  })
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    parentId: g.parentId,
    documentCount: g._count.documents,
  }))
}

/** Load the assistant's groups and return its available subjects. */
export async function listMapelForAssistant(assistant: {
  organizationId: string | null
  knowledgeBaseGroupIds: string[]
}): Promise<AvailableMapel[]> {
  const scopeIds = assistant.knowledgeBaseGroupIds
  if (scopeIds.length === 0) return []
  const groups = await prisma.knowledgeBaseGroup.findMany({
    where: {
      organizationId: assistant.organizationId,
      OR: [{ id: { in: scopeIds } }, { parentId: { in: scopeIds } }],
    },
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: { select: { documents: true } },
    },
    orderBy: { name: "asc" },
  })
  return mapelGroupsFor(
    groups.map((g) => ({ id: g.id, name: g.name, parentId: g.parentId, documentCount: g._count.documents })),
    scopeIds,
  )
}
