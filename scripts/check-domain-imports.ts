import { readFileSync } from "fs"
import path from "path"
import { execSync } from "child_process"

const root = process.cwd()

const DEPRECATED_PREFIXES = [
  "@/features/dashboard/digital-employee",
  "@/features/dashboard/workflows",
  "@/features/dashboard/files-documents",
  "@/features/dashboard/files-categories",
  "@/features/dashboard/files-groups",
  "@/features/dashboard/skills",
  "@/features/dashboard/tools",
  "@/features/dashboard/mcp-servers",
  "@/features/dashboard/mcp-api-keys",
  "@/features/dashboard/chat-sessions",
  "@/features/dashboard/groups",
  "@/features/dashboard/handoff",
  "@/features/dashboard/credentials",
  "@/features/dashboard/embed-keys",
  "@/features/dashboard/templates",
  "@/features/dashboard/approval-responses",
  "@/features/dashboard/audit",
  "@/features/dashboard/statistics",
  "@/features/dashboard/features",
  "@/features/dashboard/marketplace",
  "@/features/dashboard/memory",
  "@/features/dashboard/openapi-specs",
  "@/features/dashboard/tasks",
]

function listCandidateFiles(): string[] {
  try {
    const rgOutput = execSync(`rg --files src -g "*.ts" -g "*.tsx"`, {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean)
    return rgOutput.map((relativePath) => path.join(root, relativePath))
  } catch {
    const findOutput = execSync(
      `find src -type f \\( -name "*.ts" -o -name "*.tsx" \\)`,
      {
        encoding: "utf8",
      }
    )
      .trim()
      .split("\n")
      .filter(Boolean)
    return findOutput.map((relativePath) => path.join(root, relativePath))
  }
}

const files = listCandidateFiles()

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
