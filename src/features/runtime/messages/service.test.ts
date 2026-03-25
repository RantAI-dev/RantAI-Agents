import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getRuntimeInboxMessages,
  getRuntimeMessageStatus,
  replyToRuntimeMessage,
  sendRuntimeMessage,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createRuntimeApproval: vi.fn(),
  createRuntimeMessage: vi.fn(),
  findRuntimeActiveRun: vi.fn(),
  findRuntimeEmployeeById: vi.fn(),
  findRuntimeEmployeeByIdAndOrganization: vi.fn(),
  findRuntimeInboxMessages: vi.fn(),
  findRuntimeMessageById: vi.fn(),
  markRuntimeMessagesDelivered: vi.fn(),
  updateRuntimeMessage: vi.fn(),
}))

vi.mock("@/lib/digital-employee/audit", () => ({
  AUDIT_ACTIONS: {
    MESSAGE_SEND: "message.send",
  },
  classifyActionRisk: vi.fn(() => "medium"),
  logAudit: vi.fn(() => Promise.resolve()),
}))

describe("runtime-messages service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("marks pending inbox messages as delivered after loading", async () => {
    vi.mocked(repository.findRuntimeInboxMessages).mockResolvedValue([
      {
        id: "message_1",
        status: "pending",
      },
      {
        id: "message_2",
        status: "delivered",
      },
    ] as never)

    const result = await getRuntimeInboxMessages("employee_1")

    expect(result).toHaveLength(2)
    expect(repository.markRuntimeMessagesDelivered).toHaveBeenCalledWith(["message_1"])
  })

  it("creates approval-gated task messages for low-autonomy employees", async () => {
    vi.mocked(repository.findRuntimeEmployeeById).mockResolvedValue({
      id: "employee_1",
      organizationId: "org_1",
      autonomyLevel: "L1",
      supervisorId: "supervisor_1",
    } as never)
    vi.mocked(repository.findRuntimeEmployeeByIdAndOrganization).mockResolvedValue({
      id: "recipient_1",
    } as never)
    vi.mocked(repository.findRuntimeActiveRun).mockResolvedValue({
      id: "run_1",
    } as never)
    vi.mocked(repository.createRuntimeMessage).mockResolvedValue({
      id: "message_1",
    } as never)

    const result = await sendRuntimeMessage({
      employeeId: "employee_1",
      toEmployeeId: "recipient_1",
      type: "task",
      subject: "Task",
      content: "Please do this",
      priority: "high",
      attachments: [],
      waitForResponse: true,
    })

    expect(result).toEqual({
      success: true,
      messageId: "message_1",
      requiresApproval: true,
    })
    expect(repository.createRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending_approval",
        priority: "high",
        metadata: { waitForResponse: true },
      })
    )
  })

  it("rejects replies from non-recipients", async () => {
    vi.mocked(repository.findRuntimeMessageById).mockResolvedValue({
      id: "message_1",
      toEmployeeId: "employee_2",
      fromEmployeeId: "employee_3",
      organizationId: "org_1",
      type: "message",
      subject: "Hello",
      status: "delivered",
      responseContent: null,
      responseData: null,
      respondedAt: null,
    } as never)

    const result = await replyToRuntimeMessage("message_1", {
      employeeId: "employee_1",
      content: "Reply",
    })

    expect(result).toEqual({
      status: 403,
      error: "Not the recipient of this message",
    })
  })

  it("returns sender-facing status payloads", async () => {
    vi.mocked(repository.findRuntimeMessageById).mockResolvedValue({
      id: "message_1",
      toEmployeeId: "employee_2",
      fromEmployeeId: "employee_1",
      organizationId: "org_1",
      type: "message",
      subject: "Hello",
      status: "completed",
      responseContent: "Done",
      responseData: { ok: true },
      respondedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never)

    const result = await getRuntimeMessageStatus("message_1", "employee_1")

    expect(result).toMatchObject({
      status: "completed",
      responseContent: "Done",
      responseData: { ok: true },
    })
  })
})
