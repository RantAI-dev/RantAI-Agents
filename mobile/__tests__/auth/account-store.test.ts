import { describe, it, expect, beforeEach } from "vitest"

beforeEach(async () => {
  const mod = await import("@/auth/account-store")
  await mod.clearAllAccounts()
})

describe("account-store", () => {
  it("adds, lists, and removes accounts", async () => {
    const { addAccount, listAccounts, removeAccount } = await import("@/auth/account-store")
    await addAccount({ id: "a1", email: "x@y.z", name: "X", refreshToken: "tok1" })
    await addAccount({ id: "a2", email: "y@y.z", name: "Y", refreshToken: "tok2" })
    expect((await listAccounts()).map(a => a.id).sort()).toEqual(["a1", "a2"])
    await removeAccount("a1")
    expect((await listAccounts()).map(a => a.id)).toEqual(["a2"])
  })

  it("sets and gets active account", async () => {
    const { addAccount, setActiveAccount, getActiveAccountId } = await import("@/auth/account-store")
    await addAccount({ id: "a1", email: "x@y.z", name: "X", refreshToken: "tok1" })
    await setActiveAccount("a1")
    expect(await getActiveAccountId()).toBe("a1")
  })
})
