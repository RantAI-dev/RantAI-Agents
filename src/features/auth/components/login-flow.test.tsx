// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { LoginFlow } from "./login-flow"

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })
}

function errorResponse(status: number, code: string, message: string, headers?: HeadersInit) {
  return new Response(JSON.stringify({ error: { code, message, requestId: "r1" } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

/** What NextAuth's catch-all answers for `/api/auth/<anything it does not know>`. */
function nextAuthBadRequest() {
  return new Response(JSON.stringify("Bad request."), {
    status: 400,
    headers: { "content-type": "application/json" },
  })
}

const fetchMock = vi.fn()
const nextAuth = vi.hoisted(() => ({ signIn: vi.fn() }))

vi.mock("next-auth/react", () => ({ signIn: nextAuth.signIn }))

beforeEach(() => {
  fetchMock.mockReset()
  nextAuth.signIn.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function enterEmail(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } })
  fireEvent.click(screen.getByRole("button", { name: /continue/i }))
}

describe("LoginFlow", () => {
  it("sends an address whose domain a provider claims to that provider", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        method: "sso",
        providerId: "keycloak",
        providerName: "Acme Keycloak",
        startUrl: "/api/auth/sso/keycloak/start",
      }),
    )
    const navigate = vi.fn()
    render(<LoginFlow navigate={navigate} />)

    await enterEmail("ana@acme.com")

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/api/auth/sso/keycloak/start?callbackUrl=%2Fdashboard",
      ),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sso/discover?email=ana%40acme.com",
      expect.objectContaining({ credentials: "include" }),
    )
    // No password form: the provider is the only way in for this address.
    expect(screen.queryByLabelText("Password")).toBeNull()
  })

  it("falls back to the password form and signs in with the redirect the answer names", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ method: "password", providerId: null, providerName: null, startUrl: null }))
      .mockResolvedValueOnce(
        jsonResponse({
          user: { id: "u1", email: "ana@acme.com", name: "Ana", role: "member" },
          redirectTo: "/dashboard/chat",
        }),
      )
    const navigate = vi.fn()
    render(<LoginFlow navigate={navigate} />)

    await enterEmail("ana@acme.com")
    const password = await screen.findByLabelText("Password")
    fireEvent.change(password, { target: { value: "correct horse" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard/chat"))
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe("/api/auth/login")
    expect(JSON.parse(String(init.body))).toEqual({
      email: "ana@acme.com",
      password: "correct horse",
      callbackUrl: "/dashboard",
    })
  })

  it("hides the password form when the organisation disabled password sign-in", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ method: "password", providerId: null, providerName: null, startUrl: null }))
      .mockResolvedValueOnce(
        errorResponse(
          403,
          "password_login_disabled",
          "Your organisation signs in through single sign-on. Use the single sign-on button.",
        ),
      )
    const navigate = vi.fn()
    render(<LoginFlow navigate={navigate} />)

    await enterEmail("ana@acme.com")
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

    await screen.findByText(/only way in for this organisation|signs in through single sign-on only/i)
    expect(screen.queryByLabelText("Password")).toBeNull()
    expect(screen.getByRole("button", { name: /use a different email/i })).not.toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("says how long to wait when the throttle answers", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ method: "password", providerId: null, providerName: null, startUrl: null }))
      .mockResolvedValueOnce(
        errorResponse(429, "rate_limited", "Too many sign-in attempts.", { "retry-after": "42" }),
      )
    render(<LoginFlow navigate={vi.fn()} />)

    await enterEmail("ana@acme.com")
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toMatch(/too many sign-in attempts/i)
    expect(alert.textContent).toMatch(/42 seconds/)
  })

  it("does not say whether the email exists when the password is wrong", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ method: "password", providerId: null, providerName: null, startUrl: null }))
      .mockResolvedValueOnce(
        errorResponse(401, "unauthenticated", "The email or password is not correct."),
      )
    render(<LoginFlow navigate={vi.fn()} />)

    await enterEmail("ana@acme.com")
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "wrong" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("The email or password is not correct.")
    // Still on the password step: the address may be right and the password wrong.
    expect(screen.getByLabelText("Password")).not.toBeNull()
  })

  it("shows the sentence for an SSO failure the provider sent us back with", () => {
    render(<LoginFlow initialError="account_link_refused" navigate={vi.fn()} />)
    expect(screen.getByRole("alert").textContent).toMatch(/cannot be linked to this identity provider/i)
  })

  it("falls back to the password form when the deployment has no Rust sign-in yet", async () => {
    // RUST_ROUTES has no `auth` group: NextAuth's catch-all owns /api/auth/sso/discover and
    // answers an action it does not know with 400 "Bad request." (Auth(), @auth/core).
    fetchMock.mockResolvedValueOnce(nextAuthBadRequest())
    render(<LoginFlow navigate={vi.fn()} />)

    await enterEmail("ana@acme.com")
    expect(await screen.findByLabelText("Password")).not.toBeNull()
  })

  it("falls back to the NextAuth credentials provider when /api/auth/login is absent", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ method: "password", providerId: null, providerName: null, startUrl: null }))
      .mockResolvedValueOnce(nextAuthBadRequest())
    nextAuth.signIn.mockResolvedValueOnce({ error: undefined, ok: true })
    const navigate = vi.fn()
    render(<LoginFlow navigate={navigate} />)

    await enterEmail("ana@acme.com")
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"))
    expect(nextAuth.signIn).toHaveBeenCalledWith("credentials", {
      email: "ana@acme.com",
      password: "password123",
      redirect: false,
    })
  })

  it("does not fall back to NextAuth on a Rust 400, which carries a code", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(400, "invalid_request", "Enter an email address."))
    render(<LoginFlow navigate={vi.fn()} />)

    await enterEmail("ana@acme.com")
    expect((await screen.findByRole("alert")).textContent).toBe("Enter an email address.")
    expect(screen.queryByLabelText("Password")).toBeNull()
  })

  it.each(["//evil.test/x", "https://evil.test/x", "/\\evil.test", "/\t/evil.test"])(
    "never follows a redirectTo that leaves the site (%s)",
    async (redirectTo) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ method: "password", providerId: null, providerName: null, startUrl: null }))
        .mockResolvedValueOnce(
          jsonResponse({
            user: { id: "u1", email: "ana@acme.com", name: "Ana", role: "member" },
            redirectTo,
          }),
        )
      const navigate = vi.fn()
      render(<LoginFlow navigate={navigate} />)

      await enterEmail("ana@acme.com")
      fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "x" } })
      fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

      await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"))
    },
  )

  it("never follows a startUrl that leaves the site", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        method: "sso",
        providerId: "p1",
        providerName: "Evil",
        startUrl: "https://evil.test/start",
      }),
    )
    const navigate = vi.fn()
    render(<LoginFlow navigate={navigate} />)

    await enterEmail("ana@acme.com")
    expect(await screen.findByLabelText("Password")).not.toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("shows the answer's own sentence for a cross-site refusal, not 'suspended'", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ method: "password", providerId: null, providerName: null, startUrl: null }))
      .mockResolvedValueOnce(
        errorResponse(403, "permission_denied", "This request must come from this site."),
      )
    render(<LoginFlow navigate={vi.fn()} />)

    await enterEmail("ana@acme.com")
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This request must come from this site.",
    )
  })

  it("keeps the email step when the sign-in service cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"))
    const navigate = vi.fn()
    render(<LoginFlow navigate={navigate} />)

    await enterEmail("ana@acme.com")
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not reach the sign-in service/i)
    expect(screen.queryByLabelText("Password")).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })
})
