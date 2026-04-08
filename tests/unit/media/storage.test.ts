import { describe, it, expect, vi, beforeEach } from "vitest"

const sendMock = vi.hoisted(() => vi.fn().mockResolvedValue({}))

vi.mock("@/lib/s3", () => ({
  getS3Client: () => ({ send: sendMock }),
  getBucket: () => "rantai-files",
}))

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn().mockImplementation(function (input: unknown) {
    return { __type: "PutObject", input }
  }),
}))

import { buildMediaS3Key, uploadMediaBytes } from "@/features/media/storage"

describe("buildMediaS3Key", () => {
  it("scopes by org and modality", () => {
    const key = buildMediaS3Key({
      organizationId: "org_123",
      modality: "IMAGE",
      assetId: "asset_abc",
      extension: "png",
    })
    expect(key).toBe("media/org_123/image/asset_abc.png")
  })

  it("handles video extensions", () => {
    const key = buildMediaS3Key({
      organizationId: "org_123",
      modality: "VIDEO",
      assetId: "asset_xyz",
      extension: "mp4",
    })
    expect(key).toBe("media/org_123/video/asset_xyz.mp4")
  })
})

describe("uploadMediaBytes", () => {
  beforeEach(() => sendMock.mockClear())

  it("uploads bytes to the constructed key with the correct mime", async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const result = await uploadMediaBytes({
      organizationId: "org_1",
      modality: "IMAGE",
      assetId: "ast_1",
      mimeType: "image/png",
      extension: "png",
      bytes,
    })
    expect(result.s3Key).toBe("media/org_1/image/ast_1.png")
    expect(result.sizeBytes).toBe(3)
    expect(sendMock).toHaveBeenCalledTimes(1)
    const call = sendMock.mock.calls[0]?.[0]
    expect(call.input.Bucket).toBe("rantai-files")
    expect(call.input.Key).toBe("media/org_1/image/ast_1.png")
    expect(call.input.ContentType).toBe("image/png")
  })
})
