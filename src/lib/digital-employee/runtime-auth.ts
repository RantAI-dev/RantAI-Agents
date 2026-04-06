import { SignJWT, jwtVerify } from "jose"

const RUNTIME_SECRET = new TextEncoder().encode(
  process.env.EMPLOYEE_RUNTIME_SECRET || "rantai-employee-runtime-secret-change-me"
)

export async function createRuntimeToken(
  employeeId: string,
  runId: string,
  options?: { expiresIn?: string }
): Promise<string> {
  return new SignJWT({ employeeId, runId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(options?.expiresIn || "30d")
    .sign(RUNTIME_SECRET)
}

export async function verifyRuntimeToken(
  token: string
): Promise<{ employeeId: string; runId: string }> {
  const { payload } = await jwtVerify(token, RUNTIME_SECRET)
  return {
    employeeId: payload.employeeId as string,
    runId: payload.runId as string,
  }
}
