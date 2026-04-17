import { useQuery } from "@tanstack/react-query"
import { organizationsApi } from "@/api/organizations"

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: organizationsApi.list,
    select: (d) => d.organizations,
  })
}
