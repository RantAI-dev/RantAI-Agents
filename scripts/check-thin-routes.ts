import { existsSync, readFileSync } from "fs"
import path from "path"

const projectRoot = process.cwd()

// Phased guard: protect slices already migrated to feature services.
const PROTECTED_ROUTES = [
  "app/api/user/preferences/route.ts",
  "app/api/dashboard/tools/route.ts",
  "app/api/dashboard/tools/[id]/route.ts",
  "app/api/assistants/route.ts",
  "app/api/assistants/[id]/route.ts",
  "app/api/organizations/route.ts",
  "app/api/organizations/[id]/route.ts",
  "app/api/organizations/[id]/logo/route.ts",
  "app/api/organizations/[id]/members/route.ts",
  "app/api/organizations/[id]/members/[memberId]/route.ts",
  "app/api/dashboard/digital-employees/[id]/chat/route.ts",
  "app/api/dashboard/digital-employees/[id]/custom-tools/route.ts",
  "app/api/dashboard/digital-employees/[id]/custom-tools/[toolId]/route.ts",
  "app/api/dashboard/digital-employees/[id]/files/route.ts",
  "app/api/dashboard/digital-employees/[id]/files/[filename]/route.ts",
  "app/api/dashboard/digital-employees/[id]/go-live/route.ts",
  "app/api/dashboard/digital-employees/[id]/goals/route.ts",
  "app/api/dashboard/digital-employees/[id]/goals/[goalId]/route.ts",
  "app/api/dashboard/digital-employees/[id]/pause/route.ts",
  "app/api/dashboard/digital-employees/[id]/resume/route.ts",
  "app/api/dashboard/digital-employees/[id]/run/route.ts",
  "app/api/dashboard/digital-employees/[id]/runs/route.ts",
  "app/api/dashboard/digital-employees/[id]/runs/[runId]/route.ts",
  "app/api/dashboard/digital-employees/[id]/status/route.ts",
  "app/api/dashboard/digital-employees/[id]/terminate/route.ts",
  "app/api/dashboard/digital-employees/[id]/trust/route.ts",
  "app/api/dashboard/digital-employees/[id]/trust/promote/route.ts",
  "app/api/dashboard/digital-employees/[id]/trust/demote/route.ts",
  "app/api/dashboard/digital-employees/[id]/workspace/exec/route.ts",
  "app/api/dashboard/digital-employees/[id]/workspace/files/route.ts",
  "app/api/dashboard/digital-employees/[id]/workspace/files/read/route.ts",
  "app/api/dashboard/digital-employees/[id]/workspace/files/write/route.ts",
  "app/api/runtime/approvals/route.ts",
  "app/api/runtime/messages/inbox/route.ts",
  "app/api/runtime/messages/send/route.ts",
  "app/api/runtime/messages/[id]/status/route.ts",
  "app/api/runtime/messages/[id]/reply/route.ts",
  "app/api/runtime/runs/[runId]/output/route.ts",
  "app/api/runtime/runs/[runId]/status/route.ts",
  "app/api/runtime/tools/execute/route.ts",
  "app/api/dashboard/groups/route.ts",
  "app/api/dashboard/groups/[id]/route.ts",
  "app/api/dashboard/groups/[id]/members/route.ts",
  "app/api/dashboard/groups/[id]/start/route.ts",
  "app/api/dashboard/groups/[id]/stop/route.ts",
  "app/api/dashboard/handoff/route.ts",
  "app/api/dashboard/handoff/message/route.ts",
  "app/api/dashboard/workflows/route.ts",
  "app/api/dashboard/workflows/import/route.ts",
  "app/api/dashboard/workflows/[id]/route.ts",
  "app/api/dashboard/workflows/[id]/execute/route.ts",
  "app/api/dashboard/workflows/[id]/export/route.ts",
  "app/api/dashboard/workflows/[id]/runs/route.ts",
  "app/api/dashboard/workflows/[id]/runs/[runId]/route.ts",
  "app/api/dashboard/workflows/[id]/runs/[runId]/resume/route.ts",
  "app/api/runtime/audit/log/route.ts",
  "app/api/runtime/employees/list/route.ts",
  "app/api/runtime/employees/[id]/heartbeat/route.ts",
  "app/api/runtime/employees/[id]/sync/route.ts",
  "app/api/runtime/goals/update/route.ts",
  "app/api/runtime/integrations/credentials/route.ts",
  "app/api/runtime/integrations/store-credentials/route.ts",
  "app/api/runtime/integrations/test/route.ts",
  "app/api/runtime/onboarding/report/route.ts",
  "app/api/runtime/skills/install/route.ts",
  "app/api/runtime/skills/search/route.ts",
  "app/api/dashboard/audit/route.ts",
  "app/api/dashboard/chat/sessions/route.ts",
  "app/api/dashboard/chat/sessions/[id]/route.ts",
  "app/api/dashboard/chat/sessions/[id]/messages/route.ts",
  "app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/route.ts",
  "app/api/dashboard/files/route.ts",
  "app/api/dashboard/files/[id]/route.ts",
  "app/api/dashboard/files/[id]/intelligence/route.ts",
  "app/api/dashboard/files/categories/route.ts",
  "app/api/dashboard/files/categories/[id]/route.ts",
  "app/api/dashboard/files/groups/route.ts",
  "app/api/dashboard/files/groups/[id]/route.ts",
  "app/api/dashboard/marketplace/route.ts",
  "app/api/dashboard/marketplace/[id]/route.ts",
  "app/api/dashboard/marketplace/install/route.ts",
  "app/api/dashboard/mcp-servers/route.ts",
  "app/api/dashboard/mcp-servers/[id]/route.ts",
  "app/api/dashboard/mcp-servers/[id]/discover/route.ts",
  "app/api/dashboard/memory/route.ts",
  "app/api/dashboard/memory/[id]/route.ts",
  "app/api/dashboard/openapi-specs/route.ts",
  "app/api/dashboard/openapi-specs/[id]/route.ts",
  "app/api/dashboard/templates/route.ts",
  "app/api/dashboard/templates/[id]/route.ts",
  "app/api/dashboard/digital-employees/[id]/messages/route.ts",
  "app/api/dashboard/digital-employees/[id]/oauth-proxy/[...path]/route.ts",
  "app/api/dashboard/digital-employees/[id]/integrations/route.ts",
  "app/api/dashboard/digital-employees/[id]/integrations/[integrationId]/route.ts",
  "app/api/dashboard/digital-employees/[id]/integrations/[integrationId]/test/route.ts",
  "app/api/dashboard/digital-employees/[id]/skills/route.ts",
  "app/api/dashboard/digital-employees/[id]/skills/[skillId]/route.ts",
  "app/api/dashboard/digital-employees/[id]/skills/search/route.ts",
  "app/api/dashboard/digital-employees/[id]/tools/route.ts",
  "app/api/dashboard/digital-employees/[id]/triggers/route.ts",
  "app/api/dashboard/digital-employees/[id]/triggers/[triggerId]/route.ts",
  "app/api/dashboard/digital-employees/route.ts",
  "app/api/dashboard/digital-employees/pending-approvals/route.ts",
  "app/api/dashboard/digital-employees/[id]/route.ts",
  "app/api/dashboard/digital-employees/[id]/activity/route.ts",
  "app/api/dashboard/digital-employees/[id]/approvals/route.ts",
  "app/api/dashboard/digital-employees/[id]/export/route.ts",
  "app/api/dashboard/digital-employees/[id]/memory/route.ts",
  "app/api/dashboard/digital-employees/[id]/package/route.ts",
  "app/api/dashboard/digital-employees/[id]/purge/route.ts",
  "app/api/dashboard/digital-employees/[id]/vnc/route.ts",
  "app/api/dashboard/approvals/[id]/respond/route.ts",
  "app/api/dashboard/credentials/route.ts",
  "app/api/dashboard/credentials/[id]/route.ts",
  "app/api/dashboard/embed-keys/route.ts",
  "app/api/dashboard/embed-keys/[id]/route.ts",
  "app/api/dashboard/features/route.ts",
  "app/api/dashboard/mcp-api-keys/route.ts",
  "app/api/dashboard/mcp-api-keys/[id]/route.ts",
  "app/api/dashboard/skills/route.ts",
  "app/api/dashboard/skills/[id]/route.ts",
  "app/api/dashboard/skills/import-clawhub/route.ts",
  "app/api/dashboard/statistics/route.ts",
  "app/api/assistants/[id]/default/route.ts",
  "app/api/assistants/[id]/mcp-servers/route.ts",
  "app/api/assistants/[id]/skills/route.ts",
  "app/api/assistants/[id]/tools/route.ts",
  "app/api/assistants/[id]/workflows/route.ts",
  "app/api/user/default-assistant/route.ts",
  "app/api/admin/profile/route.ts",
  "app/api/admin/profile/avatar/route.ts",
  "app/api/admin/channels/route.ts",
  "app/api/admin/features/route.ts",
  "app/api/admin/stats/route.ts",
  "app/api/dashboard/tasks/route.ts",
  "app/api/dashboard/tasks/[id]/route.ts",
  "app/api/dashboard/tasks/[id]/comments/route.ts",
  "app/api/dashboard/tasks/[id]/events/route.ts",
  "app/api/dashboard/tasks/[id]/review/route.ts",
  "app/api/dashboard/skills/[id]/readiness/route.ts",
  "app/api/assistants/generate-prompt/route.ts",
  "app/api/widget/config/route.ts",
  "app/api/widget/upload/route.ts",
  "app/api/widget/handoff/route.ts",
  "app/api/widget/handoff/message/route.ts",
  "app/api/widget/chat/route.ts",
  "app/api/workflows/[id]/run/route.ts",
  "app/api/workflows/discover/route.ts",
  "app/api/workflows/webhook/[path]/route.ts",
  "app/api/chat/route.ts",
  "app/api/chat/upload/route.ts",
  "app/api/chat/upload/file/[fileId]/route.ts",
  "app/api/conversations/route.ts",
  "app/api/conversations/[id]/messages/route.ts",
  "app/api/conversations/[id]/status/route.ts",
  "app/api/webhooks/employees/[token]/route.ts",
  "app/api/webhooks/whatsapp/[employeeId]/route.ts",
  "app/api/whatsapp/send/route.ts",
  "app/api/whatsapp/webhook/route.ts",
  "app/api/cron/approvals/route.ts",
  "app/api/cron/cleanup-attachments/route.ts",
  "app/api/cron/workflows/route.ts",
  "app/api/upload/route.ts",
  "app/api/upload/presigned/route.ts",
  "app/api/files/[...key]/route.ts",
  "app/api/mcp/route.ts",
  "app/api/socket/route.ts",
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
