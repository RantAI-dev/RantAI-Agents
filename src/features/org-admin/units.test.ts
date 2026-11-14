import { describe, expect, it } from "vitest"
import { canMoveUnder, flattenUnits, moveTargets, subtreeIds } from "./units"
import type { UnitNode } from "./types"

function unit(id: string, parentId: string | null, children: UnitNode[] = []): UnitNode {
  return {
    id,
    parentId,
    kind: children.length > 0 ? "department" : "team",
    name: id.toUpperCase(),
    slug: id,
    externalId: null,
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
    children,
  }
}

const tree: UnitNode[] = [
  unit("a", null, [unit("b", "a", [unit("d", "b")])]),
  unit("c", null),
]

describe("the unit tree", () => {
  it("flattens parents before their children, with the depth", () => {
    expect(flattenUnits(tree).map((entry) => [entry.unit.id, entry.depth])).toEqual([
      ["a", 0],
      ["b", 1],
      ["d", 2],
      ["c", 0],
    ])
  })

  it("knows a unit's whole subtree", () => {
    expect([...subtreeIds(tree, "a")].sort()).toEqual(["a", "b", "d"])
    expect([...subtreeIds(tree, "c")]).toEqual(["c"])
    expect([...subtreeIds(tree, "missing")]).toEqual([])
  })

  it("never offers a unit itself or one of its descendants as a new parent", () => {
    const targets = moveTargets(tree, "a").map((target) => target.id)
    expect(targets).toEqual([null, "c"])
  })

  it("refuses the cycle the API refuses, including the top level always being legal", () => {
    expect(canMoveUnder(tree, "a", "b")).toBe(false)
    expect(canMoveUnder(tree, "a", "d")).toBe(false)
    expect(canMoveUnder(tree, "a", "a")).toBe(false)
    expect(canMoveUnder(tree, "a", "c")).toBe(true)
    expect(canMoveUnder(tree, "d", null)).toBe(true)
  })
})
