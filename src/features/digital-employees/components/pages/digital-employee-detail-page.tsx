import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  getDashboardDigitalEmployee,
  isServiceError,
  listDashboardDigitalEmployeeActivity,
  listDashboardDigitalEmployeeApprovals,
} from "@/src/features/digital-employees/employees/service"
import { listDigitalEmployeeRuns } from "@/src/features/digital-employees/runs/service"
import { listEmployeeFiles, getEmployeeFile } from "@/src/features/digital-employees/files/service"
import { getChatHistoryForEmployee } from "@/src/features/digital-employees/chat/service"
import { getDigitalEmployeeTrustSummary } from "@/src/features/digital-employees/trust/service"
import { listDigitalEmployeeSkills, listDigitalEmployeeTools } from "@/src/features/digital-employees/interactions/service"
import type { DigitalEmployeeItem } from "@/hooks/use-digital-employees"
import type { DigitalEmployeeHydrationData } from "@/hooks/use-digital-employee"
import type {
  ActivityDailySummary,
  ActivityFeedItem,
} from "@/src/features/digital-employees/components/detail/tab-activity"
import type { TrustSummaryData } from "@/src/features/digital-employees/components/detail/trust-score-card"
import DigitalEmployeeDetailPageClient from "./digital-employee-detail-page-client"

type EmployeeChatMessage = {
  id: string
  role: string
  content: string
  toolCalls?: unknown
  createdAt: string
}

type OnboardingStatus = {
  steps: Record<string, { status: string; details: string | null; updatedAt: string }>
  completedCount: number
  totalSteps: number
  startedAt: string
}

function toSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function settledValue<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === "fulfilled" ? result.value : undefined
}

function parseOnboardingStatus(raw: Record<string, unknown> | null): OnboardingStatus | null {
  if (!raw?.content || typeof raw.content !== "string") {
    return null
  }

  try {
    return JSON.parse(raw.content) as OnboardingStatus
  } catch {
    return null
  }
}

export default async function DigitalEmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = await params
  const session = await auth()

  if (!session?.user?.id) {
    return <DigitalEmployeeDetailPageClient employeeId={resolvedParams.id} initialData={null} />
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)
  const organizationId = orgContext?.organizationId ?? null

  const employeeResult = await getDashboardDigitalEmployee({
    id: resolvedParams.id,
    organizationId,
  })
  if (isServiceError(employeeResult)) {
    if (employeeResult.status === 404) {
      return <DigitalEmployeeDetailPageClient employeeId={resolvedParams.id} initialData={null} />
    }

    return <DigitalEmployeeDetailPageClient employeeId={resolvedParams.id} />
  }

  try {
    const [
      filesResult,
      runsResult,
      approvalsResult,
      activityResult,
      toolsResult,
      skillsResult,
      chatHistoryResult,
      trustResult,
      onboardingResult,
    ] = await Promise.allSettled([
      listEmployeeFiles({
        employeeId: resolvedParams.id,
        context: { organizationId },
      }),
      listDigitalEmployeeRuns({
        digitalEmployeeId: resolvedParams.id,
        organizationId,
        limit: 25,
      }),
      listDashboardDigitalEmployeeApprovals({
        id: resolvedParams.id,
        organizationId,
        input: { status: null },
      }),
      listDashboardDigitalEmployeeActivity({
        id: resolvedParams.id,
        organizationId,
        input: { limit: 50, before: null },
      }),
      listDigitalEmployeeTools({
        id: resolvedParams.id,
        organizationId,
      }),
      listDigitalEmployeeSkills({
        id: resolvedParams.id,
        organizationId,
      }),
      getChatHistoryForEmployee({
        employeeId: resolvedParams.id,
        context: { organizationId },
      }),
      getDigitalEmployeeTrustSummary({
        digitalEmployeeId: resolvedParams.id,
        organizationId,
      }),
      getEmployeeFile({
        employeeId: resolvedParams.id,
        filename: "ONBOARDING_STATUS.json",
        context: { organizationId },
      }),
    ])

    const filesValue = settledValue(filesResult)
    const runsValue = settledValue(runsResult)
    const approvalsValue = settledValue(approvalsResult)
    const activityValue = settledValue(activityResult)
    const toolsValue = settledValue(toolsResult)
    const skillsValue = settledValue(skillsResult)
    const chatHistoryValue = settledValue(chatHistoryResult)
    const trustValue = settledValue(trustResult)
    const onboardingValue = settledValue(onboardingResult)

    const coreHydrationComplete =
      filesValue !== undefined &&
      runsValue !== undefined &&
      approvalsValue !== undefined &&
      toolsValue !== undefined &&
      skillsValue !== undefined &&
      !isServiceError(filesValue) &&
      !isServiceError(runsValue) &&
      !isServiceError(approvalsValue) &&
      !isServiceError(toolsValue) &&
      !isServiceError(skillsValue)

    const initialData: DigitalEmployeeHydrationData | undefined = coreHydrationComplete
      ? {
          employee: toSerializable(employeeResult) as unknown as DigitalEmployeeItem,
          files: toSerializable(filesValue) as unknown as DigitalEmployeeHydrationData["files"],
          runs: toSerializable(runsValue) as unknown as DigitalEmployeeHydrationData["runs"],
          approvals: toSerializable(approvalsValue) as unknown as DigitalEmployeeHydrationData["approvals"],
          platformTools: toSerializable(
            (toolsValue as Record<string, unknown>).platform
          ) as unknown as DigitalEmployeeHydrationData["platformTools"],
          customTools: toSerializable(
            (toolsValue as Record<string, unknown>).custom
          ) as unknown as DigitalEmployeeHydrationData["customTools"],
          skills: toSerializable(skillsValue) as unknown as DigitalEmployeeHydrationData["skills"],
        }
      : undefined

    const initialChatHistory: EmployeeChatMessage[] | undefined =
      chatHistoryValue !== undefined && !isServiceError(chatHistoryValue)
      ? (toSerializable(chatHistoryValue) as unknown as EmployeeChatMessage[])
      : undefined

    const initialActivity:
      | { events: ActivityFeedItem[]; dailySummary: ActivityDailySummary }
      | undefined =
      activityValue !== undefined && !isServiceError(activityValue)
      ? (toSerializable(activityValue) as unknown as {
          events: ActivityFeedItem[]
          dailySummary: ActivityDailySummary
        })
      : undefined

    const initialTrustSummary: TrustSummaryData | undefined =
      trustValue !== undefined && !isServiceError(trustValue)
      ? (toSerializable(trustValue) as unknown as TrustSummaryData)
      : undefined

    const initialOnboardingStatus = parseOnboardingStatus(
      onboardingValue !== undefined && !isServiceError(onboardingValue)
        ? (onboardingValue as Record<string, unknown>)
        : null
    )

    return (
      <DigitalEmployeeDetailPageClient
        employeeId={resolvedParams.id}
        initialData={initialData}
        initialChatHistory={initialChatHistory}
        initialActivity={initialActivity}
        initialTrustSummary={initialTrustSummary}
        initialOnboardingStatus={initialOnboardingStatus}
      />
    )
  } catch (error) {
    console.error("Failed to hydrate digital employee detail page:", error)
    return <DigitalEmployeeDetailPageClient employeeId={resolvedParams.id} />
  }
}
