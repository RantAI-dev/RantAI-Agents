import { prisma } from "../lib/prisma"

async function main() {
  // Get the latest workflow run
  const run = await prisma.workflowRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { id: true, steps: true },
  })
  if (!run) { console.log("No runs"); return }

  const steps = run.steps as Array<{ nodeId: string; status: string; output: unknown; input?: unknown }>
  
  // Check code-rules step
  const codeStep = steps.find(s => s.nodeId === "code-rules")
  if (codeStep) {
    console.log("=== code-rules OUTPUT ===")
    console.log(JSON.stringify(codeStep.output, null, 2))
  }

  // Check what transform-normalize output (which feeds into parallel → code-rules)
  const normStep = steps.find(s => s.nodeId === "transform-normalize")
  if (normStep) {
    const output = normStep.output as Record<string, unknown>
    console.log("\n=== transform-normalize OUTPUT (key fields) ===")
    console.log("annual_limit:", output.annual_limit)
    console.log("remaining_limit:", output.remaining_limit)
    console.log("diagnosis_code:", output.diagnosis_code)
    console.log("provider_on_watchlist:", output.provider_on_watchlist)
    console.log("total_amount:", output.total_amount)
    console.log("claim_history length:", Array.isArray(output.claim_history) ? output.claim_history.length : "NOT ARRAY: " + typeof output.claim_history)
    if (Array.isArray(output.claim_history) && output.claim_history.length > 0) {
      console.log("First history item keys:", Object.keys(output.claim_history[0]))
      console.log("First item:", JSON.stringify(output.claim_history[0]))
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
