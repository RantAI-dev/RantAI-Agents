import { existsSync, readFileSync } from "fs"
import path from "path"

const projectRoot = process.cwd()

// Phased guard: protect slices already migrated to feature services.
const PROTECTED_ROUTES = [
  "src/app/api/user/preferences/route.ts",
  "src/app/api/dashboard/tools/route.ts",
  "src/app/api/dashboard/tools/[id]/route.ts",
  "src/app/api/assistants/route.ts",
  "src/app/api/assistants/[id]/route.ts",
  "src/app/api/organizations/route.ts",
  "src/app/api/organizations/[id]/route.ts",
  "src/app/api/organizations/[id]/logo/route.ts",
  "src/app/api/organizations/[id]/members/route.ts",
  "src/app/api/organizations/[id]/members/[memberId]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/chat/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/custom-tools/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/custom-tools/[toolId]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/files/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/files/[filename]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/go-live/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/goals/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/goals/[goalId]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/pause/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/resume/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/run/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/runs/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/runs/[runId]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/status/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/terminate/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/trust/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/trust/promote/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/trust/demote/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/workspace/exec/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/workspace/files/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/workspace/files/read/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/workspace/files/write/route.ts",
  "src/app/api/runtime/approvals/route.ts",
  "src/app/api/runtime/messages/inbox/route.ts",
  "src/app/api/runtime/messages/send/route.ts",
  "src/app/api/runtime/messages/[id]/status/route.ts",
  "src/app/api/runtime/messages/[id]/reply/route.ts",
  "src/app/api/runtime/runs/[runId]/output/route.ts",
  "src/app/api/runtime/runs/[runId]/status/route.ts",
  "src/app/api/runtime/tools/execute/route.ts",
  "src/app/api/dashboard/groups/route.ts",
  "src/app/api/dashboard/groups/[id]/route.ts",
  "src/app/api/dashboard/groups/[id]/members/route.ts",
  "src/app/api/dashboard/groups/[id]/start/route.ts",
  "src/app/api/dashboard/groups/[id]/stop/route.ts",
  "src/app/api/dashboard/handoff/route.ts",
  "src/app/api/dashboard/handoff/message/route.ts",
  "src/app/api/dashboard/workflows/route.ts",
  "src/app/api/dashboard/workflows/import/route.ts",
  "src/app/api/dashboard/workflows/[id]/route.ts",
  "src/app/api/dashboard/workflows/[id]/execute/route.ts",
  "src/app/api/dashboard/workflows/[id]/export/route.ts",
  "src/app/api/dashboard/workflows/[id]/runs/route.ts",
  "src/app/api/dashboard/workflows/[id]/runs/[runId]/route.ts",
  "src/app/api/dashboard/workflows/[id]/runs/[runId]/resume/route.ts",
  "src/app/api/runtime/audit/log/route.ts",
  "src/app/api/runtime/employees/list/route.ts",
  "src/app/api/runtime/employees/[id]/heartbeat/route.ts",
  "src/app/api/runtime/employees/[id]/sync/route.ts",
  "src/app/api/runtime/goals/update/route.ts",
  "src/app/api/runtime/integrations/credentials/route.ts",
  "src/app/api/runtime/integrations/store-credentials/route.ts",
  "src/app/api/runtime/integrations/test/route.ts",
  "src/app/api/runtime/onboarding/report/route.ts",
  "src/app/api/runtime/skills/install/route.ts",
  "src/app/api/runtime/skills/search/route.ts",
  "src/app/api/dashboard/audit/route.ts",
  "src/app/api/dashboard/chat/sessions/route.ts",
  "src/app/api/dashboard/chat/sessions/[id]/route.ts",
  "src/app/api/dashboard/chat/sessions/[id]/messages/route.ts",
  "src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/route.ts",
  "src/app/api/dashboard/files/route.ts",
  "src/app/api/dashboard/files/[id]/route.ts",
  "src/app/api/dashboard/files/[id]/intelligence/route.ts",
  "src/app/api/dashboard/files/categories/route.ts",
  "src/app/api/dashboard/files/categories/[id]/route.ts",
  "src/app/api/dashboard/files/groups/route.ts",
  "src/app/api/dashboard/files/groups/[id]/route.ts",
  "src/app/api/dashboard/marketplace/route.ts",
  "src/app/api/dashboard/marketplace/[id]/route.ts",
  "src/app/api/dashboard/marketplace/install/route.ts",
  "src/app/api/dashboard/mcp-servers/route.ts",
  "src/app/api/dashboard/mcp-servers/[id]/route.ts",
  "src/app/api/dashboard/mcp-servers/[id]/discover/route.ts",
  "src/app/api/dashboard/memory/route.ts",
  "src/app/api/dashboard/memory/[id]/route.ts",
  "src/app/api/dashboard/openapi-specs/route.ts",
  "src/app/api/dashboard/openapi-specs/[id]/route.ts",
  "src/app/api/dashboard/templates/route.ts",
  "src/app/api/dashboard/templates/[id]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/messages/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/oauth-proxy/[...path]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/integrations/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/integrations/[integrationId]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/integrations/[integrationId]/test/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/skills/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/skills/[skillId]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/skills/search/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/tools/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/triggers/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/triggers/[triggerId]/route.ts",
  "src/app/api/dashboard/digital-employees/route.ts",
  "src/app/api/dashboard/digital-employees/pending-approvals/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/activity/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/approvals/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/export/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/memory/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/package/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/purge/route.ts",
  "src/app/api/dashboard/digital-employees/[id]/vnc/route.ts",
  "src/app/api/dashboard/approvals/[id]/respond/route.ts",
  "src/app/api/dashboard/credentials/route.ts",
  "src/app/api/dashboard/credentials/[id]/route.ts",
  "src/app/api/dashboard/embed-keys/route.ts",
  "src/app/api/dashboard/embed-keys/[id]/route.ts",
  "src/app/api/dashboard/features/route.ts",
  "src/app/api/dashboard/mcp-api-keys/route.ts",
  "src/app/api/dashboard/mcp-api-keys/[id]/route.ts",
  "src/app/api/dashboard/skills/route.ts",
  "src/app/api/dashboard/skills/[id]/route.ts",
  "src/app/api/dashboard/skills/import-clawhub/route.ts",
  "src/app/api/dashboard/statistics/route.ts",
  "src/app/api/assistants/[id]/default/route.ts",
  "src/app/api/assistants/[id]/mcp-servers/route.ts",
  "src/app/api/assistants/[id]/skills/route.ts",
  "src/app/api/assistants/[id]/tools/route.ts",
  "src/app/api/assistants/[id]/workflows/route.ts",
  "src/app/api/user/default-assistant/route.ts",
  "src/app/api/admin/profile/route.ts",
  "src/app/api/admin/profile/avatar/route.ts",
  "src/app/api/admin/channels/route.ts",
  "src/app/api/admin/features/route.ts",
  "src/app/api/admin/stats/route.ts",
  "src/app/api/dashboard/tasks/route.ts",
  "src/app/api/dashboard/tasks/[id]/route.ts",
  "src/app/api/dashboard/tasks/[id]/comments/route.ts",
  "src/app/api/dashboard/tasks/[id]/events/route.ts",
  "src/app/api/dashboard/tasks/[id]/review/route.ts",
  "src/app/api/dashboard/skills/[id]/readiness/route.ts",
  "src/app/api/assistants/generate-prompt/route.ts",
  "src/app/api/widget/config/route.ts",
  "src/app/api/widget/upload/route.ts",
  "src/app/api/widget/handoff/route.ts",
  "src/app/api/widget/handoff/message/route.ts",
  "src/app/api/widget/chat/route.ts",
  "src/app/api/workflows/[id]/run/route.ts",
  "src/app/api/workflows/discover/route.ts",
  "src/app/api/workflows/webhook/[path]/route.ts",
  "src/app/api/chat/route.ts",
  "src/app/api/chat/upload/route.ts",
  "src/app/api/chat/upload/file/[fileId]/route.ts",
  "src/app/api/conversations/route.ts",
  "src/app/api/conversations/[id]/messages/route.ts",
  "src/app/api/conversations/[id]/status/route.ts",
  "src/app/api/webhooks/employees/[token]/route.ts",
  "src/app/api/webhooks/whatsapp/[employeeId]/route.ts",
  "src/app/api/whatsapp/send/route.ts",
  "src/app/api/whatsapp/webhook/route.ts",
  "src/app/api/cron/approvals/route.ts",
  "src/app/api/cron/cleanup-attachments/route.ts",
  "src/app/api/cron/workflows/route.ts",
  "src/app/api/upload/route.ts",
  "src/app/api/upload/presigned/route.ts",
  "src/app/api/files/[...key]/route.ts",
  "src/app/api/mcp/route.ts",
  "src/app/api/socket/route.ts",
]

const violations: string[] = []

for (const relativePath of PROTECTED_ROUTES) {
  const absolutePath = path.join(projectRoot, relativePath)
  if (!existsSync(absolutePath)) {
    violations.push(`${relativePath}: missing protected route file`)
    continue
  }

  const source = readFileSync(absolutePath, "utf8")
  const hasPrismaImport =
    source.includes(`from "@/lib/prisma"`) ||
    source.includes("from '@/lib/prisma'") ||
    source.includes(`import("@/lib/prisma")`) ||
    source.includes("import('@/lib/prisma')")
  const hasDirectPrismaUsage = /\bprisma\./.test(source)

  if (hasPrismaImport || hasDirectPrismaUsage) {
    violations.push(
      `${relativePath}: route contains direct Prisma access (must call feature service instead)`
    )
  }
}

if (violations.length > 0) {
  console.error("Thin route guard failed:")
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log(
  `Thin route guard passed for ${PROTECTED_ROUTES.length} protected routes.`
)
