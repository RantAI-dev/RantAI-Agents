import { readFileSync } from "fs"
import path from "path"
import { execSync } from "child_process"
import ts from "typescript"

const root = process.cwd()

const files = execSync(`rg --files app src -g "*.ts" -g "*.tsx"`, {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean)

const hardImportViolations: string[] = []
const shimViolations: string[] = []
const thinPageViolations: string[] = []
const reportOnlyEffectWarnings: string[] = []
const blockingEffectViolations: string[] = []

const deprecatedImportPrefixes = [
  "@/app/dashboard/_components/chat",
  "@/app/dashboard/digital-employees/_components",
  "@/app/dashboard/digital-employees/[id]/_components",
  "@/app/dashboard/digital-employees/new/_components",
  "@/app/dashboard/workflows/_components",
  "@/app/dashboard/knowledge/_components",
  "@/app/dashboard/marketplace/_components",
  "@/app/dashboard/settings/mcp/_components",
  "@/app/dashboard/settings/tools/_components",
  "@/app/dashboard/settings/embed/_components",
  "@/app/dashboard/settings/statistics/_components",
  "@/app/dashboard/settings/memory/_components",
  "@/app/dashboard/account/_components",
  "@/app/dashboard/organization/_components",
  "@/app/dashboard/agent/_components",
  "@/app/dashboard/agent-builder/_components",
]

const migratedShimDirs = [
  "app/dashboard/_components/chat/",
  "app/dashboard/digital-employees/_components/",
  "app/dashboard/digital-employees/[id]/_components/",
  "app/dashboard/digital-employees/new/_components/",
  "app/dashboard/workflows/_components/",
  "app/dashboard/knowledge/_components/",
  "app/dashboard/marketplace/_components/",
  "app/dashboard/settings/mcp/_components/",
  "app/dashboard/settings/tools/_components/",
  "app/dashboard/settings/embed/_components/",
  "app/dashboard/settings/statistics/_components/",
  "app/dashboard/settings/memory/_components/",
  "app/dashboard/account/_components/",
  "app/dashboard/organization/_components/",
  "app/dashboard/agent/_components/",
  "app/dashboard/agent-builder/_components/",
]

type DataEffectScopeMode = "strict" | "report-only"

interface DataEffectScopePolicy {
  name: string
  mode: DataEffectScopeMode
  prefixes: string[]
  rationale: string
}

const dataEffectScopePolicies: DataEffectScopePolicy[] = [
  {
    name: "credentials",
    mode: "strict",
    prefixes: ["src/features/credentials/components/"],
    rationale: "credential settings are already server-fed and should stay mutation-driven",
  },
  {
    name: "embed-keys",
    mode: "strict",
    prefixes: ["src/features/embed-keys/components/"],
    rationale: "embed key UI is already on the thin-page pattern",
  },
  {
    name: "marketplace",
    mode: "strict",
    prefixes: ["src/features/marketplace/components/"],
    rationale: "marketplace screens are already migrated to feature slices",
  },
  {
    name: "mcp",
    mode: "strict",
    prefixes: ["src/features/mcp/components/"],
    rationale: "MCP settings are already handled by thin route shells",
  },
  {
    name: "memory",
    mode: "strict",
    prefixes: ["src/features/memory/components/"],
    rationale: "memory settings are already in the migrated client slice",
  },
  {
    name: "platform-features",
    mode: "strict",
    prefixes: ["src/features/platform-features/components/"],
    rationale: "platform feature toggles are already migrated",
  },
  {
    name: "statistics",
    mode: "strict",
    prefixes: ["src/features/statistics/components/"],
    rationale: "statistics settings are already migrated",
  },
  {
    name: "tools",
    mode: "strict",
    prefixes: ["src/features/tools/components/"],
    rationale: "tool management is already behind thin routes and server actions",
  },
  {
    name: "organizations",
    mode: "strict",
    prefixes: ["src/features/organizations/components/"],
    rationale: "organization settings are already migrated",
  },
  {
    name: "user",
    mode: "strict",
    prefixes: ["src/features/user/components/"],
    rationale: "user account settings are already migrated",
  },
  {
    name: "audit",
    mode: "strict",
    prefixes: ["src/features/audit/components/"],
    rationale: "audit views are already on the migrated shell",
  },
  {
    name: "digital-employees",
    mode: "strict",
    prefixes: ["app/dashboard/digital-employees/", "src/features/digital-employees/components/"],
    rationale: "digital employee detail flows are now server-hydrated with lifecycle-only polling",
  },
  {
    name: "workflows",
    mode: "strict",
    prefixes: ["app/dashboard/workflows/", "src/features/workflows/components/", "src/features/workflows/components/pages/"],
    rationale: "workflow editor selectors now rely on server-hydrated initial payloads",
  },
  {
    name: "knowledge",
    mode: "strict",
    prefixes: ["app/dashboard/knowledge/", "src/features/knowledge/components/", "src/features/knowledge/components/pages/"],
    rationale: "knowledge pages/dialogs now follow server-fed loading patterns",
  },
  {
    name: "conversations-agent",
    mode: "strict",
    prefixes: ["src/features/conversations/components/agent/", "src/features/conversations/components/agent/pages/"],
    rationale: "agent workspace still restores and polls data on the client",
  },
  {
    name: "conversations-chat",
    mode: "strict",
    prefixes: ["src/features/conversations/components/chat/", "src/features/conversations/components/chat/pages/"],
    rationale: "chat workspace still has client polling and streaming helpers",
  },
]

function getDataEffectScope(relativePath: string): DataEffectScopePolicy | null {
  for (const policy of dataEffectScopePolicies) {
    if (policy.prefixes.some((prefix) => relativePath.startsWith(prefix))) {
      return policy
    }
  }
  return null
}

function isDirectDataEffectText(sourceText: string): boolean {
  return /\bfetch\s*\(|\baxios\./.test(sourceText) || /\/api\//.test(sourceText)
}

function hasDataEffectHelperCall(effectBodyText: string, helperNames: Set<string>): string[] {
  const matches: string[] = []
  for (const helperName of helperNames) {
    const helperCallPattern = new RegExp(`(?:\\bvoid\\s+|\\bawait\\s+)?${escapeRegExp(helperName)}\\s*\\(`)
    if (helperCallPattern.test(effectBodyText)) {
      matches.push(helperName)
    }
  }
  return matches
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function collectDataEffectHelperNames(sourceFile: ts.SourceFile): Set<string> {
  const helperNames = new Set<string>()

  const recordHelperIfDataFetching = (name: string, bodyText: string) => {
    if (isDirectDataEffectText(bodyText)) {
      helperNames.add(name)
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      recordHelperIfDataFetching(node.name.text, node.body.getText(sourceFile))
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const name = node.name.text
      const initializer = node.initializer

      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        const bodyText = initializer.body.getText(sourceFile)
        recordHelperIfDataFetching(name, bodyText)
      }

      if (ts.isCallExpression(initializer)) {
        const callee = initializer.expression
        const isUseCallback =
          (ts.isIdentifier(callee) && callee.text === "useCallback") ||
          (ts.isPropertyAccessExpression(callee) && callee.name.text === "useCallback")

        if (isUseCallback) {
          const firstArg = initializer.arguments[0]
          if (firstArg && (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg))) {
            const bodyText = firstArg.body.getText(sourceFile)
            recordHelperIfDataFetching(name, bodyText)
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return helperNames
}

function analyzeUseEffectCalls(sourceFile: ts.SourceFile, helperNames: Set<string>): string[] {
  const violations: string[] = []

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isUseEffect =
        (ts.isIdentifier(callee) && (callee.text === "useEffect" || callee.text === "useLayoutEffect")) ||
        (ts.isPropertyAccessExpression(callee) &&
          (callee.name.text === "useEffect" || callee.name.text === "useLayoutEffect"))

      if (isUseEffect) {
        const firstArg = node.arguments[0]
        if (firstArg && (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg))) {
          const effectBodyText = firstArg.body.getText(sourceFile)
          const directMatch = isDirectDataEffectText(effectBodyText)
          const helperMatches = hasDataEffectHelperCall(effectBodyText, helperNames)

          if (directMatch || helperMatches.length > 0) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
            const detail = directMatch
              ? "contains direct fetch/axios/api access"
              : `calls data-loading helper${helperMatches.length > 1 ? "s" : ""} ${helperMatches.map((name) => `\`${name}\``).join(", ")}`
            violations.push(`L${line}: useEffect ${detail}`)
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

const allowedDashboardRedirectPages = new Set([
  "app/dashboard/page.tsx",
  "app/dashboard/settings/page.tsx",
  "app/dashboard/organization/page.tsx",
  "app/dashboard/organization/members/page.tsx",
  "app/dashboard/organization/billing/page.tsx",
])

const thinDashboardPageExportPattern = /^export \{ default \} from "@\/src\/features\/.+?"\s*$/

for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath)
  const source = readFileSync(absolutePath, "utf8")

  for (const prefix of deprecatedImportPrefixes) {
    if (source.includes(prefix)) {
      hardImportViolations.push(`${relativePath}: imports deprecated path '${prefix}'`)
    }
  }

  if (migratedShimDirs.some((dir) => relativePath.startsWith(dir))) {
    const normalized = source.trim()
    const isShim = /^export \* from ".*"\n(?:export \{ default \} from ".*"\n?)?$/.test(`${normalized}\n`)
    if (!isShim) {
      shimViolations.push(`${relativePath}: migrated dashboard shim contains implementation code`)
    }
  }

  if (relativePath.startsWith("app/dashboard/") && relativePath.endsWith("/page.tsx")) {
    const normalized = source.trim()
    if (allowedDashboardRedirectPages.has(relativePath)) {
      if (!/redirect\(/.test(normalized)) {
        thinPageViolations.push(`${relativePath}: expected redirect-based page stub`)
      }
    } else if (!thinDashboardPageExportPattern.test(normalized)) {
      thinPageViolations.push(
        `${relativePath}: expected thin page re-export to '@/src/features/*'`
      )
    }
  }

  const dataEffectScope = getDataEffectScope(relativePath)
  if (dataEffectScope) {
    const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const helperNames = collectDataEffectHelperNames(sourceFile)
    const violations = analyzeUseEffectCalls(sourceFile, helperNames)

    for (const violation of violations) {
      const message = `${relativePath} [${dataEffectScope.name}]: useEffect ${violation} (${dataEffectScope.rationale})`
      if (dataEffectScope.mode === "strict") {
        blockingEffectViolations.push(message)
      } else {
        reportOnlyEffectWarnings.push(message)
      }
    }
  }
}

if (
  hardImportViolations.length > 0 ||
  shimViolations.length > 0 ||
  thinPageViolations.length > 0 ||
  blockingEffectViolations.length > 0
) {
  console.error("Frontend compliance guard failed:")
  for (const violation of hardImportViolations) {
    console.error(`- ${violation}`)
  }
  for (const violation of shimViolations) {
    console.error(`- ${violation}`)
  }
  for (const violation of thinPageViolations) {
    console.error(`- ${violation}`)
  }
  if (blockingEffectViolations.length > 0) {
    console.error("\nBlocking data-effect violations in migrated scopes:")
    for (const violation of blockingEffectViolations) {
      console.error(`- ${violation}`)
    }
  }
  process.exit(1)
}

console.log(`Frontend compliance import/shim guard passed for ${files.length} files.`)

const strictScopeNames = dataEffectScopePolicies.filter((scope) => scope.mode === "strict").map((scope) => scope.name)
const reportOnlyScopeNames = dataEffectScopePolicies.filter((scope) => scope.mode === "report-only").map((scope) => scope.name)

console.log(
  `Data-effect guard: ${strictScopeNames.length} strict scope(s), ${reportOnlyScopeNames.length} report-only scope(s).`
)

if (reportOnlyEffectWarnings.length > 0) {
  console.log("\nFrontend compliance data-effect report (report-only scopes):")
  for (const warning of reportOnlyEffectWarnings) {
    console.log(`- ${warning}`)
  }
  console.log(`\nTotal report-only data-effect findings: ${reportOnlyEffectWarnings.length}`)
}
