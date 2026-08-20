import { prisma } from "@/lib/prisma"

/**
 * Nested knowledge bases.
 *
 * A KB can sit inside another KB, so a library can be organised the way its
 * owner thinks about it — "Kurikulum Merdeka" > "Kelas VII" > "IPA" — rather
 * than as one flat list that grows until nothing is findable.
 *
 * The selection rule is the whole feature, and it is deliberately the boring
 * one that every file browser already taught people:
 *
 *   **Selecting a KB selects its entire subtree.**
 *
 * Pick the parent and you search everything beneath it. Pick one child and you
 * search only that child. There is no third mode and no "include children?"
 * checkbox, because a picker whose meaning depends on a second control is a
 * picker people misread.
 *
 * Expansion happens on the read path rather than being denormalised into the
 * join table. Moving a KB is then a single `parentId` write instead of a
 * rewrite of every document link beneath it, and there is no second copy of
 * the hierarchy that can drift out of sync with the first.
 */

/**
 * How deep the tree may go, counting the root as depth 1.
 *
 * This is a product limit, not a technical one. Five levels is already deeper
 * than anyone navigates comfortably, and the cap is what lets {@link expandGroupIds}
 * terminate in a bounded number of queries instead of needing a recursive CTE
 * (which would tie the engine to PostgreSQL and break the SQLite-backed tests).
 */
export const MAX_KB_DEPTH = 5

export class KbTreeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CYCLE"
      | "TOO_DEEP"
      | "PARENT_NOT_FOUND"
      | "CROSS_ORG"
      | "SELF_PARENT",
  ) {
    super(message)
    this.name = "KbTreeError"
  }
}

type GroupNode = {
  id: string
  parentId: string | null
  organizationId: string | null
}

/**
 * Every id in `groupIds` plus every descendant, de-duplicated.
 *
 * This is the function that makes "pick the parent" mean "search everything
 * inside it". It is called on the retrieval path, so it walks level by level
 * with one query per level (at most {@link MAX_KB_DEPTH}) instead of one query
 * per node.
 *
 * Unknown ids are passed through untouched rather than dropped: callers filter
 * documents by these ids, and an id matching no KB simply matches no document.
 * Silently discarding it here would turn "this KB was deleted" into "no filter
 * at all", which widens a search instead of narrowing it.
 */
export async function expandGroupIds(groupIds: string[]): Promise<string[]> {
  if (!groupIds || groupIds.length === 0) return []

  const seen = new Set<string>(groupIds)
  let frontier = [...new Set(groupIds)]

  // Bounded by depth, not by node count: each pass fetches one whole level.
  for (let depth = 0; depth < MAX_KB_DEPTH && frontier.length > 0; depth++) {
    const children: { id: string }[] = await prisma.knowledgeBaseGroup.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    })
    const next: string[] = []
    for (const child of children) {
      // A cycle would make this loop forever if the depth cap ever grew; the
      // `seen` guard makes termination independent of the cap.
      if (seen.has(child.id)) continue
      seen.add(child.id)
      next.push(child.id)
    }
    frontier = next
  }

  return [...seen]
}

/** Ancestor chain of `id`, nearest parent first. Excludes `id` itself. */
export async function ancestorsOf(id: string): Promise<GroupNode[]> {
  const chain: GroupNode[] = []
  const seen = new Set<string>([id])
  let cursor = await loadNode(id)

  while (cursor?.parentId) {
    if (seen.has(cursor.parentId)) break // defensive: pre-existing cycle
    const parent = await loadNode(cursor.parentId)
    if (!parent) break
    chain.push(parent)
    seen.add(parent.id)
    cursor = parent
  }

  return chain
}

/** 1 for a root KB, 2 for its child, and so on. */
export async function depthOf(id: string): Promise<number> {
  return (await ancestorsOf(id)).length + 1
}

/** Deepest level below `id`. 0 when it has no children. */
export async function subtreeHeight(id: string): Promise<number> {
  let height = 0
  let frontier = [id]
  const seen = new Set<string>([id])

  for (let level = 0; level < MAX_KB_DEPTH && frontier.length > 0; level++) {
    const children: { id: string }[] = await prisma.knowledgeBaseGroup.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    })
    const next = children.map((c) => c.id).filter((cid) => !seen.has(cid))
    next.forEach((cid) => seen.add(cid))
    if (next.length === 0) break
    height += 1
    frontier = next
  }

  return height
}

/**
 * Validate a proposed `parentId` before it is written.
 *
 * Rejects, in order: parenting a KB to itself, a parent that does not exist,
 * a parent in a different organization, a parent that is already a descendant
 * (which would orphan the cycle from the root and make it invisible), and a
 * move that would push the moved subtree past {@link MAX_KB_DEPTH}.
 *
 * `childId` is optional so this can also validate a parent chosen at creation
 * time, when the child does not exist yet.
 */
export async function assertParentAllowed(params: {
  parentId: string
  childId?: string
  organizationId: string | null
}): Promise<void> {
  const { parentId, childId, organizationId } = params

  if (childId && parentId === childId) {
    throw new KbTreeError("A knowledge base cannot be its own parent.", "SELF_PARENT")
  }

  const parent = await loadNode(parentId)
  if (!parent) {
    throw new KbTreeError("The chosen parent knowledge base no longer exists.", "PARENT_NOT_FOUND")
  }

  // A global KB (organizationId null) may parent anything; otherwise the two
  // must belong to the same org. Without this, nesting would be a way to pull
  // another org's KB into your own tree and search it.
  if (parent.organizationId !== null && parent.organizationId !== organizationId) {
    throw new KbTreeError(
      "That parent belongs to a different organization.",
      "CROSS_ORG",
    )
  }

  if (childId) {
    const descendants = new Set(await expandGroupIds([childId]))
    if (descendants.has(parentId)) {
      throw new KbTreeError(
        "That would nest a knowledge base inside one of its own children.",
        "CYCLE",
      )
    }
  }

  const parentDepth = await depthOf(parentId)
  const movedHeight = childId ? await subtreeHeight(childId) : 0
  // parentDepth + 1 is where the child lands; + movedHeight is where its own
  // deepest descendant lands.
  if (parentDepth + 1 + movedHeight > MAX_KB_DEPTH) {
    throw new KbTreeError(
      `Knowledge bases can be nested at most ${MAX_KB_DEPTH} levels deep.`,
      "TOO_DEEP",
    )
  }
}

/** Direct children count, used to decide whether a delete needs `cascade`. */
export async function childCount(id: string): Promise<number> {
  return prisma.knowledgeBaseGroup.count({ where: { parentId: id } })
}

async function loadNode(id: string): Promise<GroupNode | null> {
  return prisma.knowledgeBaseGroup.findUnique({
    where: { id },
    select: { id: true, parentId: true, organizationId: true },
  })
}

// ─── Pure helpers (no database) ──────────────────────────────────────────────

export interface FlatGroup {
  id: string
  name: string
  parentId: string | null
  [key: string]: unknown
}

export interface TreeGroup<T extends FlatGroup> {
  node: T
  depth: number
  children: TreeGroup<T>[]
}

/**
 * Arrange a flat list into a forest, preserving the input order among siblings.
 *
 * A node whose `parentId` points outside the list is treated as a root rather
 * than dropped. That happens legitimately whenever the list is org-scoped and
 * the parent is a global KB, and dropping those rows would make a user's own
 * KBs vanish from their sidebar.
 */
export function buildTree<T extends FlatGroup>(groups: T[]): TreeGroup<T>[] {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const nodes = new Map<string, TreeGroup<T>>(
    groups.map((g) => [g.id, { node: g, depth: 0, children: [] }]),
  )
  const roots: TreeGroup<T>[] = []

  for (const group of groups) {
    const self = nodes.get(group.id)!
    const parent =
      group.parentId && byId.has(group.parentId) ? nodes.get(group.parentId) : undefined
    if (parent) parent.children.push(self)
    else roots.push(self)
  }

  const stamp = (list: TreeGroup<T>[], depth: number) => {
    for (const item of list) {
      item.depth = depth
      stamp(item.children, depth + 1)
    }
  }
  stamp(roots, 0)

  return roots
}

/** Depth-first flatten of {@link buildTree}, so a tree renders as indented rows. */
export function flattenTree<T extends FlatGroup>(tree: TreeGroup<T>[]): Array<T & { depth: number }> {
  const out: Array<T & { depth: number }> = []
  const walk = (list: TreeGroup<T>[]) => {
    for (const item of list) {
      out.push({ ...item.node, depth: item.depth })
      walk(item.children)
    }
  }
  walk(tree)
  return out
}

/**
 * Ids that would be searched given a selection, computed in memory.
 *
 * The server is still authoritative — {@link expandGroupIds} runs on every
 * retrieval — but a picker has to show "3 KBs selected" the instant a parent is
 * ticked, and it already holds the full list.
 */
export function expandSelectionLocally<T extends FlatGroup>(
  groups: T[],
  selectedIds: string[],
): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const g of groups) {
    if (!g.parentId) continue
    const siblings = childrenOf.get(g.parentId) ?? []
    siblings.push(g.id)
    childrenOf.set(g.parentId, siblings)
  }

  const out = new Set<string>()
  const queue = [...selectedIds]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (out.has(id)) continue
    out.add(id)
    queue.push(...(childrenOf.get(id) ?? []))
  }

  return [...out]
}
