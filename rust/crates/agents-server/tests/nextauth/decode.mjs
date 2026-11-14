// Decodes a session cookie with the real Auth.js code, the way the Next.js pages will.
// Input in the environment: COOKIE (the Cookie header), SECRET, SECURE ("true" or "false").
// Output: one JSON line, each payload `null` when Auth.js refuses the cookie: {"decoded": <payload of decode()>, "fromRequest": <payload of getToken()>}.
import { decode, getToken } from "next-auth/jwt"

const secure = process.env.SECURE === "true"
const salt = secure ? "__Secure-authjs.session-token" : "authjs.session-token"
const cookie = process.env.COOKIE ?? ""
const token = cookie
  .split(";")
  .map((p) => p.trim())
  .filter((p) => p.startsWith(`${salt}=`) || p.startsWith(`${salt}.`))
  .map((p) => p.slice(p.indexOf("=") + 1))
  .join("")
// A token Auth.js cannot read is `null`, as `getToken` reports it.
const decoded = await decode({ token, secret: process.env.SECRET, salt }).catch(() => null)
const fromRequest = await getToken({
  req: { headers: new Headers({ cookie }) },
  secret: process.env.SECRET,
  secureCookie: secure,
})
console.log(JSON.stringify({ decoded, fromRequest }))
