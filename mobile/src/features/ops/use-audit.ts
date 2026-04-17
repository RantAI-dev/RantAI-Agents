import { useQuery } from "@tanstack/react-query"
import { auditApi } from "@/api/audit"

export function useAudit() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: auditApi.list,
    select: (d) => d.entries,
  })
}
