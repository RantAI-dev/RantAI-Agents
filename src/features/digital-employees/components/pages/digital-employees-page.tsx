import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { listDashboardDigitalEmployees } from "@/features/digital-employees/employees/service"
import { listDashboardTasks } from "@/features/digital-employees/tasks/service"
import DigitalEmployeesPageClient from "./digital-employees-page-client"
import type { DigitalEmployeeItem } from "@/hooks/use-digital-employees"
import type { EnrichedTask } from "@/lib/digital-employee/task-types"

function mapEmployeesForClient(
  employees: Awaited<ReturnType<typeof listDashboardDigitalEmployees>>
): DigitalEmployeeItem[] {
  return employees.map((employee) => employee as unknown as DigitalEmployeeItem)
}

function mapTasksForClient(
  tasks: Awaited<ReturnType<typeof listDashboardTasks>>
): EnrichedTask[] {
  return tasks as unknown as EnrichedTask[]
}

export default async function DigitalEmployeesPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return <DigitalEmployeesPageClient initialEmployees={[]} initialTasks={[]} />
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)

  const [employees, tasks] = await Promise.all([
    listDashboardDigitalEmployees({
      organizationId: orgContext?.organizationId ?? null,
    }),
    orgContext?.organizationId
      ? listDashboardTasks({ organizationId: orgContext.organizationId, filter: {} })
      : Promise.resolve([]),
  ])

  return (
    <DigitalEmployeesPageClient
      initialEmployees={mapEmployeesForClient(employees)}
      initialTasks={mapTasksForClient(tasks)}
    />
  )
}
