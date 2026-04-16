import { QueryClient } from "@tanstack/react-query"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { mmkvAsyncAdapter } from "./mmkv"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false
        return failureCount < 2
      },
    },
  },
})

export const queryPersister = createAsyncStoragePersister({
  storage: mmkvAsyncAdapter,
  key: "react-query-cache",
  throttleTime: 1_000,
})
