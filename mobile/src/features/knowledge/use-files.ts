import { useQuery } from "@tanstack/react-query"
import { filesApi } from "@/api/files"

export function useFiles() {
  return useQuery({
    queryKey: ["files"],
    queryFn: filesApi.list,
    select: (d) => d.files,
  })
}

export function useFile(id: string | null) {
  return useQuery({
    queryKey: ["files", id],
    queryFn: () => filesApi.get(id!),
    enabled: !!id,
  })
}
