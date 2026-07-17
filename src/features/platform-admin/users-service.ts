/**
 * Platform-wide (cross-org) user administration for the superadmin pages.
 * Suspension uses User.suspendedAt (NOT User.status, which is live-chat
 * presence). No permanent delete — suspend is the supported off-switch.
 */
import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import { randomBytes } from "crypto"
import { writeAdminAudit, type AdminActor } from "./audit"

export interface AdminUserFilters {
  search?: string
  role?: "USER" | "ADMIN"
  suspended?: boolean
  page?: number
  pageSize?: number
}

export async function listUsers(filters: AdminUserFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25))

  const where: Record<string, unknown> = {}
  if (filters.search) {
    where.OR = [
      { email: { contains: filters.search, mode: "insensitive" } },
      { name: { contains: filters.search, mode: "insensitive" } },
    ]
  }
  if (filters.role) where.role = filters.role
  if (filters.suspended === true) where.suspendedAt = { not: null }
  if (filters.suspended === false) where.suspendedAt = null

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        suspendedAt: true,
        lastActiveAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ])

  // Org memberships in one query for the page of users.
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: {
      userId: true,
      role: true,
      organization: { select: { id: true, name: true } },
    },
  })
  const orgsByUser = new Map<string, { id: string; name: string; role: string }[]>()
  for (const m of memberships) {
    const list = orgsByUser.get(m.userId) ?? []
    list.push({ id: m.organization.id, name: m.organization.name, role: m.role })
    orgsByUser.set(m.userId, list)
  }

  return {
    users: users.map((u) => ({ ...u, organizations: orgsByUser.get(u.id) ?? [] })),
    total,
    page,
    pageSize,
  }
}

export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      suspendedAt: true,
      lastActiveAt: true,
      createdAt: true,
    },
  })
  if (!user) return null
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: {
      role: true,
      acceptedAt: true,
      organization: { select: { id: true, name: true } },
    },
  })
  return {
    ...user,
    organizations: memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
      pending: !m.acceptedAt,
    })),
  }
}

export async function createUser(
  actor: AdminActor,
  input: { email: string; name: string; password?: string; role?: "USER" | "ADMIN" }
): Promise<{ user: { id: string; email: string }; generatedPassword: string | null } | { error: string }> {
  const email = input.email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Invalid email" }
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { error: "A user with this email already exists" }

  const generatedPassword = input.password ? null : randomBytes(9).toString("base64url")
  const password = input.password || generatedPassword!
  if (password.length < 8) return { error: "Password must be at least 8 characters" }

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim() || email.split("@")[0],
      passwordHash: await hash(password, 12),
      status: "OFFLINE",
      role: input.role === "ADMIN" ? "ADMIN" : "USER",
    },
    select: { id: true, email: true },
  })
  await writeAdminAudit({
    actor,
    action: "user.create",
    targetType: "user",
    targetId: user.id,
    targetLabel: email,
    metadata: { role: input.role ?? "USER" },
  })
  return { user, generatedPassword }
}

/** Would this change leave the platform with zero active ADMINs? */
async function wouldRemoveLastAdmin(userId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, suspendedAt: true },
  })
  if (!target || target.role !== "ADMIN" || target.suspendedAt) return false
  const otherActiveAdmins = await prisma.user.count({
    where: { role: "ADMIN", suspendedAt: null, id: { not: userId } },
  })
  return otherActiveAdmins === 0
}

export async function setUserSuspended(
  actor: AdminActor,
  userId: string,
  suspended: boolean
): Promise<{ ok: true } | { error: string }> {
  if (suspended && userId === actor.id) return { error: "You cannot suspend yourself" }
  if (suspended && (await wouldRemoveLastAdmin(userId))) {
    return { error: "Cannot suspend the last active admin" }
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { suspendedAt: suspended ? new Date() : null },
    select: { email: true },
  })
  await writeAdminAudit({
    actor,
    action: suspended ? "user.suspend" : "user.reactivate",
    targetType: "user",
    targetId: userId,
    targetLabel: user.email,
  })
  return { ok: true }
}

export async function setUserRole(
  actor: AdminActor,
  userId: string,
  role: "USER" | "ADMIN"
): Promise<{ ok: true } | { error: string }> {
  if (role === "USER" && userId === actor.id) return { error: "You cannot demote yourself" }
  if (role === "USER" && (await wouldRemoveLastAdmin(userId))) {
    return { error: "Cannot demote the last active admin" }
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { email: true },
  })
  await writeAdminAudit({
    actor,
    action: "user.role_change",
    targetType: "user",
    targetId: userId,
    targetLabel: user.email,
    metadata: { role },
  })
  return { ok: true }
}

/**
 * Force-reset a user's password: sets a random temp password and returns it
 * ONCE for the admin to hand over out-of-band (works without SMTP on-prem).
 */
export async function resetUserPassword(
  actor: AdminActor,
  userId: string
): Promise<{ tempPassword: string } | { error: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user) return { error: "User not found" }
  const tempPassword = randomBytes(9).toString("base64url")
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hash(tempPassword, 12) },
  })
  await writeAdminAudit({
    actor,
    action: "user.password_reset",
    targetType: "user",
    targetId: userId,
    targetLabel: user.email,
  })
  return { tempPassword }
}
