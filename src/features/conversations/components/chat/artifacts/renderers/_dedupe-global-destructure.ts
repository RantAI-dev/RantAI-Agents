/**
 * Models often write `const { useState, useMemo } = React;` at the top of a
 * component even though the sandbox already binds those names (the React
 * iframe destructures every hook in its prelude; the R3F scene receives them
 * as function parameters). A second `const` with the same name is a
 * SyntaxError — "Identifier 'useState' has already been declared" — that
 * takes down the whole artifact.
 *
 * Rewrite such statements so already-bound names are dropped. Names the
 * sandbox does NOT provide (e.g. `Profiler`, `version`) are kept so they are
 * not silently undefined.
 */
export function dedupeGlobalDestructure(
  code: string,
  globalName: string,
  provided: ReadonlySet<string>,
): string {
  const re = new RegExp(
    String.raw`^([ \t]*)(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:window\.|globalThis\.)?${globalName}\s*;?[ \t]*$`,
    "gm",
  )
  return code.replace(re, (_m, indent: string, names: string) => {
    const keep: string[] = []
    for (const raw of names.split(",")) {
      const entry = raw.trim()
      if (!entry) continue
      // `{ useState: useLocalState }` binds the alias — always keep.
      const aliased = entry.match(/^(\w+)\s*:\s*(\w+)$/)
      if (aliased) {
        keep.push(entry)
        continue
      }
      if (!provided.has(entry)) keep.push(entry)
    }
    if (keep.length === 0) return `${indent}// (${globalName} names already in scope)`
    return `${indent}const { ${keep.join(", ")} } = ${globalName};`
  })
}
