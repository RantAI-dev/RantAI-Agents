import { beforeEach } from "vitest"
import { configureKb, resetKbRuntime } from "@/lib/kb-runtime/runtime"
import { makeFakeKbRuntime } from "./helpers/kb-fakes"

/**
 * Every test starts with in-memory KB ports registered, so engine code never
 * throws "port is not configured" just because a test didn't care about
 * storage. Tests that assert on a port call `configureKb({ … })` with their
 * own fake, which merges over these.
 */
beforeEach(() => {
  resetKbRuntime()
  configureKb(makeFakeKbRuntime())
})
