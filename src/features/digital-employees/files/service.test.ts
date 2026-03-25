import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getEmployeeFile,
  listEmployeeFiles,
  syncEmployeeFilesForEmployee,
  updateEmployeeFile,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findEmployeeFileByName: vi.fn(),
  findEmployeeForFiles: vi.fn(),
  listEmployeeFilesByEmployeeId: vi.fn(),
  syncEmployeeFiles: vi.fn(),
  upsertEmployeeFile: vi.fn(),
}))

describe("digital employee files service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists files for an accessible employee", async () => {
    vi.mocked(repository.findEmployeeForFiles).mockResolvedValue({
      id: "employee_1",
    } as never)
    vi.mocked(repository.listEmployeeFilesByEmployeeId).mockResolvedValue([
      { filename: "a.txt" },
    ] as never)

    const result = await listEmployeeFiles({
      employeeId: "employee_1",
      context: { organizationId: "org_1" },
    })

    expect(result).toEqual([{ filename: "a.txt" }])
  })

  it("syncs files in batch when the payload is an array", async () => {
    vi.mocked(repository.findEmployeeForFiles).mockResolvedValue({
      id: "employee_1",
    } as never)
    vi.mocked(repository.syncEmployeeFiles).mockResolvedValue([
      { filename: "a.txt" },
      { filename: "b.txt" },
    ] as never)

    const result = await syncEmployeeFilesForEmployee({
      employeeId: "employee_1",
      updatedBy: "user_1",
      input: {
        files: [
          { filename: "a.txt", content: "A" },
          { filename: "b.txt", content: "B" },
        ],
      },
      context: { organizationId: null },
    })

    expect(result).toEqual([{ filename: "a.txt" }, { filename: "b.txt" }])
    expect(repository.syncEmployeeFiles).toHaveBeenCalledWith(
      [
        { filename: "a.txt", content: "A" },
        { filename: "b.txt", content: "B" },
      ],
      "employee_1",
      "user_1"
    )
  })

  it("returns 404 when a file is missing", async () => {
    vi.mocked(repository.findEmployeeForFiles).mockResolvedValue({
      id: "employee_1",
    } as never)
    vi.mocked(repository.findEmployeeFileByName).mockResolvedValue(null)

    const result = await getEmployeeFile({
      employeeId: "employee_1",
      filename: "missing.txt",
      context: { organizationId: null },
    })

    expect(result).toEqual({ status: 404, error: "File not found" })
  })

  it("upserts a single file using the provided content", async () => {
    vi.mocked(repository.findEmployeeForFiles).mockResolvedValue({
      id: "employee_1",
    } as never)
    vi.mocked(repository.upsertEmployeeFile).mockResolvedValue({
      filename: "note.md",
      content: "hello",
    } as never)

    const result = await updateEmployeeFile({
      employeeId: "employee_1",
      filename: "note.md",
      updatedBy: "user_1",
      input: { content: "hello" },
      context: { organizationId: "org_1" },
    })

    expect(result).toEqual({ filename: "note.md", content: "hello" })
    expect(repository.upsertEmployeeFile).toHaveBeenCalledWith(
      "employee_1",
      "note.md",
      "hello",
      "user_1"
    )
  })
})
