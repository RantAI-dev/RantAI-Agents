import { readFileSync } from "fs"
import path from "path"
import { execSync } from "child_process"

const root = process.cwd()

const DEPRECATED_PREFIXES = [
  "@/src/features/dashboard/digital-employee",
  "@/src/features/dashboard/workflows",
  "@/src/features/dashboard/knowledge-documents",
  "@/src/features/dashboard/knowledge-categories",
  "@/src/features/dashboard/knowledge-groups",
  "@/src/features/dashboard/skills",
  "@/src/features/dashboard/tools",
  "@/src/features/dashboard/mcp-servers",
  "@/src/features/dashboard/mcp-api-keys",
  "@/src/features/dashboard/chat-sessions",
  "@/src/features/dashboard/groups",
  "@/src/features/dashboard/handoff",
  "@/src/features/dashboard/credentials",
  "@/src/features/dashboard/embed-keys",
  "@/src/features/dashboard/templates",
  "@/src/features/dashboard/approval-responses",
  "@/src/features/dashboard/audit",
  "@/src/features/dashboard/statistics",
  "@/src/features/dashboard/features",
  "@/src/features/dashboard/marketplace",
  "@/src/features/dashboard/memory",
  "@/src/features/dashboard/openapi-specs",
  "@/src/features/dashboard/tasks",
]

const files = execSync(`rg --files app src -g "*.ts" -g "*.tsx"`, {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((relativePath) => path.join(root, relativePath))

const violations: string[] = []

for (const file of files) {
  const source = readFileSync(file, "utf8")
  for (const prefix of DEPRECATED_PREFIXES) {
    if (source.includes(prefix)) {
      violations.push(`${path.relative(root, file)}: imports deprecated domain path '${prefix}'`)
    }
  }
}

if (violations.length > 0) {
  console.error("Domain import guard failed:")
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log(`Domain import guard passed for ${files.length} files.`)
