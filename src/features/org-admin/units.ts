/**
 * The department/team tree: what the Teams screen may move a unit under.
 *
 * A unit may not become its own parent, and not a child of one of its own descendants: that is
 * the cycle the API refuses with a 409. The screen hides those targets instead of offering a move
 * that can only fail.
 */

import type { UnitNode } from "./types"

export interface FlatUnit {
  unit: UnitNode
  depth: number
}

/** Depth-first, parents before their children, so a tree renders as a list. */
export function flattenUnits(nodes: UnitNode[], depth = 0): FlatUnit[] {
  return nodes.flatMap((unit) => [
    { unit, depth },
    ...flattenUnits(unit.children ?? [], depth + 1),
  ])
}

/** Every unit at or below `unitId`, `unitId` included. */
export function subtreeIds(nodes: UnitNode[], unitId: string): Set<string> {
  const found = flattenUnits(nodes).find((entry) => entry.unit.id === unitId)
  if (!found) return new Set()
  return new Set(flattenUnits([found.unit]).map((entry) => entry.unit.id))
}

/**
 * Where `unitId` may move: every unit except itself and its own descendants, plus the top level
 * (`null`). `null` is always a legal target, so a move back out of a department is possible.
 */
export function moveTargets(nodes: UnitNode[], unitId: string): Array<{ id: string | null; label: string }> {
  const blocked = subtreeIds(nodes, unitId)
  const targets: Array<{ id: string | null; label: string }> = [{ id: null, label: "Top level" }]
  for (const { unit, depth } of flattenUnits(nodes)) {
    if (blocked.has(unit.id)) continue
    targets.push({ id: unit.id, label: `${"— ".repeat(depth)}${unit.name}` })
  }
  return targets
}

/** Whether `parentId` is a legal new home for `unitId`. */
export function canMoveUnder(nodes: UnitNode[], unitId: string, parentId: string | null): boolean {
  if (parentId === null) return true
  if (parentId === unitId) return false
  return !subtreeIds(nodes, unitId).has(parentId)
}

/** The unit's own depth, and whether it already sits directly under `parentId`. */
export function isSameParent(nodes: UnitNode[], unitId: string, parentId: string | null): boolean {
  const found = flattenUnits(nodes).find((entry) => entry.unit.id === unitId)
  if (!found) return false
  return found.unit.parentId === parentId
}
