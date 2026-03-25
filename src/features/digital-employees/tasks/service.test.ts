import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardTask,
  createDashboardTaskComment,
  getDashboardTaskDetail,
  listDashboardTasks,
  reviewDashboardTask,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  addTaskComment: vi.fn(),
  createTaskForOrganization: vi.fn(),
  deleteTaskById: vi.fn(),
  findTaskDetail: vi.fn(),
  listTaskComments: vi.fn(),
  listTaskEvents: vi.fn(),
  listTasksByOrganization: vi.fn(),
  submitTaskReview: vi.fn(),
  updateTaskById: vi.fn(),
}))

describe("dashboard-tasks service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("maps topLevelOnly filter to task query filter", async () => {
    vi.mocked(repository.listTasksByOrganization).mockResolvedValue([])

    await listDashboardTasks({
      organizationId: "org_1",
      filter: { topLevelOnly: true },
    })

    expect(repository.listTasksByOrganization).toHaveBeenCalledWith("org_1", {
      topLevelOnly: true,
    })
  })

  it("returns 503 when task creation cannot reach any active container", async () => {
    vi.mocked(repository.createTaskForOrganization).mockResolvedValue(null)

    const result = await createDashboardTask({
      organizationId: "org_1",
      userId: "user_1",
      input: { title: "Investigate issue" },
    })

    expect(result).toEqual({
      status: 503,
      error: "No active container available to create task",
    })
  })

  it("returns 404 when task detail is missing", async () => {
    vi.mocked(repository.findTaskDetail).mockResolvedValue(null)

    const result = await getDashboardTaskDetail({
      organizationId: "org_1",
      taskId: "task_1",
    })

    expect(result).toEqual({ status: 404, error: "Task not found" })
  })

  it("returns 502 when adding a comment fails", async () => {
    vi.mocked(repository.addTaskComment).mockResolvedValue(null)

    const result = await createDashboardTaskComment({
      organizationId: "org_1",
      taskId: "task_1",
      userId: "user_1",
      input: { content: "Ship this" },
    })

    expect(result).toEqual({ status: 502, error: "Failed to add comment" })
  })

  it("returns 502 when review submission fails", async () => {
    vi.mocked(repository.submitTaskReview).mockResolvedValue(null)

    const result = await reviewDashboardTask({
      organizationId: "org_1",
      taskId: "task_1",
      input: { action: "approve" },
    })

    expect(result).toEqual({ status: 502, error: "Review submission failed" })
  })
})
