/**
 * In-memory stand-in for prisma.userMemory, just enough for the memory module.
 * Values are stored JSON-serialized (like a Json column) and every call yields to the
 * event loop first, so concurrent callers genuinely interleave between read and write.
 */

type Row = {
  id: string
  userId: string
  type: string
  key: string
  value: string // JSON
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type Where = Record<string, unknown>

const tick = () => new Promise<void>((r) => setImmediate(r))

function out(row: Row) {
  return { ...row, value: JSON.parse(row.value), updatedAt: new Date(row.updatedAt), createdAt: new Date(row.createdAt) }
}

function matches(row: Row, where: Where): boolean {
  for (const [k, v] of Object.entries(where)) {
    const actual = (row as unknown as Record<string, unknown>)[k]
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const cond = v as { gt?: Date; lt?: Date }
      if (cond.gt !== undefined && !(actual instanceof Date && actual.getTime() > cond.gt.getTime())) return false
      if (cond.lt !== undefined && !(actual instanceof Date && actual.getTime() < cond.lt.getTime())) return false
      continue
    }
    if (v instanceof Date) {
      if (!(actual instanceof Date) || actual.getTime() !== v.getTime()) return false
      continue
    }
    if (actual !== v) return false
  }
  return true
}

export function createFakeUserMemoryDb() {
  const rows = new Map<string, Row>()
  /** Called after every findFirst resolves (lets a test inject a foreign writer). */
  const hooks: { afterFindFirst?: (result: unknown) => Promise<void> | void } = {}

  const userMemory = {
    async findFirst(args: { where: Where; orderBy?: unknown }) {
      await tick()
      const found = [...rows.values()]
        .filter((r) => matches(r, args.where))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
      const result = found ? out(found) : null
      if (hooks.afterFindFirst) await hooks.afterFindFirst(result)
      return result
    },
    async findMany(args: { where: Where }) {
      await tick()
      return [...rows.values()].filter((r) => matches(r, args.where)).map(out)
    },
    async updateMany(args: { where: Where; data: { value?: unknown; updatedAt?: Date } }) {
      await tick()
      let count = 0
      for (const r of rows.values()) {
        if (!matches(r, args.where)) continue
        if (args.data.value !== undefined) r.value = JSON.stringify(args.data.value)
        r.updatedAt = args.data.updatedAt ? new Date(args.data.updatedAt) : new Date()
        count++
      }
      return { count }
    },
    async update(args: { where: { id: string }; data: { value?: unknown } }) {
      await tick()
      const r = rows.get(args.where.id)
      if (!r) throw Object.assign(new Error("not found"), { code: "P2025" })
      if (args.data.value !== undefined) r.value = JSON.stringify(args.data.value)
      r.updatedAt = new Date()
      return out(r)
    },
    async create(args: { data: { id: string; userId: string; type: string; key: string; value: unknown; expiresAt?: Date } }) {
      await tick()
      if (rows.has(args.data.id)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
      const now = new Date()
      const row: Row = {
        id: args.data.id,
        userId: args.data.userId,
        type: args.data.type,
        key: args.data.key,
        value: JSON.stringify(args.data.value),
        expiresAt: args.data.expiresAt ?? null,
        createdAt: now,
        updatedAt: now,
      }
      rows.set(row.id, row)
      return out(row)
    },
    async upsert(args: {
      where: { id: string }
      create: { id: string; userId: string; type: string; key: string; value: unknown; expiresAt?: Date }
      update: { value?: unknown; expiresAt?: Date }
    }) {
      await tick()
      const r = rows.get(args.where.id)
      if (!r) return userMemory.create({ data: args.create })
      if (args.update.value !== undefined) r.value = JSON.stringify(args.update.value)
      if (args.update.expiresAt) r.expiresAt = args.update.expiresAt
      r.updatedAt = new Date()
      return out(r)
    },
    async deleteMany(args: { where: Where }) {
      await tick()
      let count = 0
      for (const [id, r] of rows) if (matches(r, args.where)) { rows.delete(id); count++ }
      return { count }
    },
  }

  return {
    prisma: { userMemory },
    rows,
    hooks,
    reset() {
      rows.clear()
      hooks.afterFindFirst = undefined
    },
    /** Direct write that bypasses the module (simulates another server instance). */
    foreignWrite(id: string, mutate: (value: Record<string, unknown>) => void) {
      const r = rows.get(id)!
      const v = JSON.parse(r.value)
      mutate(v)
      r.value = JSON.stringify(v)
      r.updatedAt = new Date(r.updatedAt.getTime() + 1000)
    },
  }
}

/** Shared instance for vi.mock("@/lib/prisma") factories. */
export const fakeDb = createFakeUserMemoryDb()
