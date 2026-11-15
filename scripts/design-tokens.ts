import { readFileSync, writeFileSync } from "fs"
import path from "path"
import { renderTokensCss } from "../src/lib/design-tokens/render"
import type { DesignTokens } from "../src/lib/design-tokens/schema"

// Regenerates src/styles/tokens.css from src/styles/tokens.json. A unit test fails when the
// committed CSS no longer matches the JSON, so run this after every token change.
const root = process.cwd()
const source = path.join(root, "src/styles/tokens.json")
const target = path.join(root, "src/styles/tokens.css")

const tokens = JSON.parse(readFileSync(source, "utf8")) as DesignTokens
writeFileSync(target, renderTokensCss(tokens))
console.log(`tokens: wrote ${path.relative(root, target)}`)
