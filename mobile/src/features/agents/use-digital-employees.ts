import { useQuery } from "@tanstack/react-query"
import { digitalEmployeesApi } from "@/api/digital-employees"

export function useDigitalEmployees() {
  return useQuery({
    queryKey: ["digital-employees"],
    queryFn: digitalEmployeesApi.list,
    select: (d) => d.digitalEmployees,
  })
}

export function useDigitalEmployee(id: string | null) {
  return useQuery({
    queryKey: ["digital-employees", id],
    queryFn: () => digitalEmployeesApi.get(id!),
    enabled: !!id,
  })
}
