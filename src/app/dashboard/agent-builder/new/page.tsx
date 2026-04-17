import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { WizardPageClient } from "@/features/assistants/wizard/components/wizard-page-client"

export default async function Page() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: session.user.id, acceptedAt: { not: null } },
    select: { organizationId: true },
  })
  if (!membership) redirect("/")

  const organizationId = membership.organizationId

  const [assistants, tools, skills, mcp, kbs] = await Promise.all([
    prisma.assistant.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        emoji: true,
        systemPrompt: true,
        model: true,
        useKnowledgeBase: true,
        knowledgeBaseGroupIds: true,
        isSystemDefault: true,
        isBuiltIn: true,
        liveChatEnabled: true,
        tags: true,
        createdAt: true,
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    }),
    prisma.tool.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      select: { id: true, name: true, displayName: true, description: true },
    }),
    prisma.skill.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      select: { id: true, name: true, displayName: true, description: true },
    }),
    prisma.mcpServerConfig.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      select: { id: true, name: true, description: true },
    }),
    prisma.knowledgeBaseGroup.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ])

  return (
    <WizardPageClient
      initialAssistants={assistants.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      }))}
      catalogs={{
        tools: tools.map((t) => ({
          id: t.id,
          name: t.displayName || t.name,
          description: t.description ?? "",
        })),
        skills: skills.map((s) => ({
          id: s.id,
          name: s.displayName || s.name,
          description: s.description ?? "",
        })),
        mcp: mcp.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description ?? "",
        })),
        kbs: kbs.map((k) => ({ id: k.id, name: k.name })),
      }}
    />
  )
}
