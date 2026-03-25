import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getChatEvents,
  getChatHistoryForEmployee,
  sendChatMessage,
} from "./service"
import * as repository from "./repository"
import { orchestrator } from "@/lib/digital-employee"

vi.mock("@/lib/digital-employee", () => ({
  orchestrator: {
    getGroupContainerUrl: vi.fn(),
    startGroup: vi.fn(),
  },
}))

vi.mock("./repository", () => ({
  createChatMessage: vi.fn(),
  createEmployeeRun: vi.fn(),
  findChatMessagesByEmployeeId: vi.fn(),
  findEmployeeForChat: vi.fn(),
  findEmployeeGroupById: vi.fn(),
  findRecentChatMessagesByEmployeeId: vi.fn(),
  updateEmployeeRun: vi.fn(),
}))

describe("digital employee chat service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(orchestrator.getGroupContainerUrl).mockResolvedValue("http://localhost:4242")
    vi.mocked(orchestrator.startGroup).mockResolvedValue({
      containerId: "container_1",
      port: 4242,
    })
  })

  it("returns an empty poll payload when no event buffer exists", () => {
    expect(getChatEvents("missing")).toEqual({ events: [], done: true })
  })

  it("returns 404 when chat history is requested for a missing employee", async () => {
    vi.mocked(repository.findEmployeeForChat).mockResolvedValue(null)

    const result = await getChatHistoryForEmployee({
      employeeId: "employee_1",
      context: { organizationId: null },
    })

    expect(result).toEqual({ status: 404, error: "Not found" })
  })

  it("creates a user message and persists the assistant response", async () => {
    vi.mocked(repository.findEmployeeForChat).mockResolvedValue({
      id: "employee_1",
      groupId: "group_1",
    } as never)
    vi.mocked(repository.findEmployeeGroupById).mockResolvedValue({
      containerPort: 4242,
      gatewayToken: "gateway-token",
      containerId: "container_1",
      status: "RUNNING",
    } as never)
    vi.mocked(repository.createEmployeeRun).mockResolvedValue({
      id: "run_1",
    } as never)
    vi.mocked(repository.createChatMessage).mockResolvedValue({
      id: "message_1",
    } as never)
    vi.mocked(repository.findRecentChatMessagesByEmployeeId).mockResolvedValue([] as never)
    vi.mocked(repository.updateEmployeeRun).mockResolvedValue({
      id: "run_1",
    } as never)

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ response: "All done" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    )

    const result = await sendChatMessage({
      employeeId: "employee_1",
      context: { organizationId: "org_1" },
      input: { message: "Hello" },
      awaitProcessing: true,
    })

    expect(result).toEqual({ messageId: expect.any(String) })
    expect(repository.createChatMessage).toHaveBeenCalledTimes(2)
    expect(repository.createChatMessage).toHaveBeenNthCalledWith(1, {
      digitalEmployeeId: "employee_1",
      role: "user",
      content: "Hello",
    })
    expect(repository.updateEmployeeRun).toHaveBeenCalledWith(
      "run_1",
      expect.objectContaining({ status: "COMPLETED" })
    )
  })
})
