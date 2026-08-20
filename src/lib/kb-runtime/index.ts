/**
 * App-facing entry point for the KB runtime.
 *
 * Importing this module wires the real adapters. App code that is about to
 * enter the KB engine (knowledge services, chat retrieval, the widget/agent
 * APIs, the dev server bootstrap) should import from here.
 *
 * The engine itself must NOT import this file — it imports ./runtime and
 * ./ports only, so it stays free of app infrastructure even transitively.
 * `bun run check:kb-boundary` enforces that.
 */

import { configureKb } from "./runtime"
import { appKbRuntime } from "./adapters"

configureKb(appKbRuntime())

export { configureKb, kb, hasKbPort, resetKbRuntime } from "./runtime"
export type * from "./ports"
