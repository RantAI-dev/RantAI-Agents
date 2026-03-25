import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getAdminAvatar,
  getAdminProfile,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  downloadAvatarByKey: vi.fn(),
  findUserAvatarS3Key: vi.fn(),
  findUserProfileById: vi.fn(),
  updateUserProfileName: vi.fn(),
}))

describe("admin-profile service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 when profile user does not exist", async () => {
    vi.mocked(repository.findUserProfileById).mockResolvedValue(null)

    const result = await getAdminProfile("user_1")

    expect(result).toEqual({ status: 404, error: "Agent not found" })
  })

  it("infers jpeg content-type from avatar key", async () => {
    vi.mocked(repository.findUserAvatarS3Key).mockResolvedValue("avatars/user_1.jpg")
    vi.mocked(repository.downloadAvatarByKey).mockResolvedValue(Buffer.from("avatar"))

    const result = await getAdminAvatar("user_1")

    expect(result).toMatchObject({ contentType: "image/jpeg" })
  })
})
