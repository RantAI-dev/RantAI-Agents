import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { workflowEngine } from "@/lib/workflow"
import { emitWorkflowEvent } from "@/lib/workflow/engine"
import { executeChatflow, type ChatflowMemoryContext } from "@/lib/workflow/chatflow"
import { extractAndSaveFacts, stripSources } from "@/lib/workflow/chatflow-memory"
import {
  loadWorkingMemory,
  semanticRecall,
  loadUserProfile,
  updateWorkingMemory,
  storeForSemanticRecall,
  getMastraMemory,
  MEMORY_CONFIG,
} from "@/lib/memory"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/dashboard/workflows/[id]/execute - Execute a workflow (session auth)
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const input = body.input || {}
    const threadId = body.threadId || `test_${id}_${Date.now()}`

    const workflow = await prisma.workflow.findUnique({
      where: { id },
    })

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    // CHATFLOW mode — return streaming response with memory + run history
    if (workflow.mode === "CHATFLOW") {
      const message = typeof input === "string" ? input : input.message || input.question || JSON.stringify(input)

      // Use test-specific userId to avoid polluting developer's profile
      const testUserId = `test_user_${id}`

      // Create WorkflowRun record BEFORE execution for run history tracking
      const run = await prisma.workflowRun.create({
        data: {
          workflowId: id,
          status: "RUNNING",
          input: { message } as Prisma.InputJsonValue,
          steps: [],
        },
      })

      // Load memory for test chat (scoped to testUserId, with Mastra path)
      let memoryContext: ChatflowMemoryContext | undefined
      try {
        const workingMemory = await loadWorkingMemory(threadId)

        let semanticResults: Awaited<ReturnType<typeof semanticRecall>> = []
        if (MEMORY_CONFIG.useMastraMemory) {
          try {
            const mastraMemory = getMastraMemory()
            semanticResults = await mastraMemory.recall(message, {
              resourceId: testUserId, threadId, topK: 5,
            })
          } catch (err) {
            if (MEMORY_CONFIG.gracefulDegradation) {
              semanticResults = await semanticRecall(message, testUserId, threadId)
            }
          }
        } else {
          semanticResults = await semanticRecall(message, testUserId, threadId)
        }

        const userProfile = await loadUserProfile(testUserId)
        memoryContext = { workingMemory, semanticResults, userProfile }
      } catch (err) {
        console.error("[Execute] Memory load error:", err)
      }

      // Extract system_context from input (used by claim investigation chatflow)
      const systemContext = typeof input === "object" && input.system_context ? String(input.system_context) : undefined

      // Pass run.id to enable Socket.io step events + run tracking
      const { response, stepLogs } = await executeChatflow(workflow, message, systemContext, memoryContext, run.id)

      // Fallback (no STREAM_OUTPUT reached) — return plain text response
      if (!response) {
        const lastOutput = stepLogs.filter(s => s.output).pop()?.output
        const text = typeof lastOutput === "string" ? lastOutput : JSON.stringify(lastOutput ?? "No output")
        const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8", "X-Run-Id": run.id })
        await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "COMPLETED", output: { text } as Prisma.InputJsonValue, steps: JSON.parse(JSON.stringify(stepLogs)) as Prisma.InputJsonValue, completedAt: new Date() } })
        return new Response(text, { headers })
      }

      // Stream tee for memory save + run history update
      const streamBody = response.body
      if (streamBody) {
        const [clientStream, saveStream] = streamBody.tee()

        // Background: accumulate response text, save memory, and update run record
        ;(async () => {
          try {
            const reader = saveStream.getReader()
            const decoder = new TextDecoder()
            let fullResponse = ""
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              fullResponse += decoder.decode(value, { stream: true })
            }

            if (!fullResponse.trim()) return

            // Strip ---SOURCES--- delimiter before saving to memory
            const cleanResponse = stripSources(fullResponse)
            const messageId = `msg_${Date.now()}`

            // Save working memory (session context)
            await updateWorkingMemory(testUserId, threadId, message, cleanResponse, messageId, [], [])

            // Save semantic recall (vector DB)
            await storeForSemanticRecall(testUserId, threadId, message, cleanResponse)

            // Mastra dual-write (optional)
            if (MEMORY_CONFIG.dualWrite) {
              try {
                const mastraMemory = getMastraMemory()
                await mastraMemory.saveMessage(threadId, { role: 'user', content: message, metadata: { userId: testUserId, messageId, timestamp: new Date().toISOString() } })
                await mastraMemory.saveMessage(threadId, { role: 'assistant', content: cleanResponse, metadata: { userId: testUserId, messageId, timestamp: new Date().toISOString() } })
              } catch (mastraErr) {
                console.error("[Execute] Mastra dual-write error (non-fatal):", mastraErr)
              }
            }

            // Extract facts to user profile (non-blocking LLM call)
            await extractAndSaveFacts(testUserId, threadId, message, cleanResponse)

            // TTL 24h for test chat memories — auto-cleanup
            await prisma.userMemory.updateMany({
              where: { userId: testUserId },
              data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
            })

            // Update WorkflowRun with completion status and step logs
            await prisma.workflowRun.update({
              where: { id: run.id },
              data: {
                status: "COMPLETED",
                output: { text: cleanResponse } as Prisma.InputJsonValue,
                steps: JSON.parse(JSON.stringify(stepLogs)) as Prisma.InputJsonValue,
                completedAt: new Date(),
              },
            })

            emitWorkflowEvent(run.id, "workflow:run:complete", {
              status: "COMPLETED",
              durationMs: Date.now() - run.startedAt.getTime(),
            })

            console.log(`[Execute] Test chat memory saved for ${testUserId} (thread: ${threadId}, TTL: 24h)`)
          } catch (err) {
            console.error("[Execute] Chatflow memory save error:", err)
            // Mark run as failed on error
            await prisma.workflowRun.update({
              where: { id: run.id },
              data: {
                status: "FAILED",
                error: String(err),
                steps: JSON.parse(JSON.stringify(stepLogs)) as Prisma.InputJsonValue,
                completedAt: new Date(),
              },
            }).catch(() => {})
          }
        })()

        const headers = new Headers(response.headers)
        headers.set("X-Run-Id", run.id)
        return new Response(clientStream, { headers })
      }

      // No stream body — update run as completed immediately
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          steps: JSON.parse(JSON.stringify(stepLogs)) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      })

      return response
    }

    // STANDARD mode — execute async so client gets runId before steps start
    const runId = await workflowEngine.executeAsync(id, input)

    // Return the run record immediately (status: RUNNING)
    const run = await prisma.workflowRun.findUnique({
      where: { id: runId },
    })

    return NextResponse.json(run, { status: 201 })
  } catch (error) {
    console.error("Failed to execute workflow:", error)
    return NextResponse.json({ error: "Failed to execute workflow" }, { status: 500 })
  }
}
