export type EmployeePermission =
  | "employee.create" | "employee.read" | "employee.update" | "employee.delete"
  | "employee.deploy" | "employee.run"
  | "approval.respond"
  | "integration.manage"
  | "audit.read"
  | "message.read"
  | "template.share"

const ROLE_PERMISSIONS: Record<string, EmployeePermission[]> = {
  owner: [
    "employee.create", "employee.read", "employee.update", "employee.delete",
    "employee.deploy", "employee.run", "approval.respond",
    "integration.manage", "audit.read", "message.read", "template.share",
  ],
  admin: [
    "employee.create", "employee.read", "employee.update", "employee.delete",
    "employee.deploy", "employee.run", "approval.respond",
    "integration.manage", "audit.read", "message.read", "template.share",
  ],
  member: [
    "employee.read", "employee.update", "employee.run",
    "approval.respond", "message.read",
  ],
  viewer: [
    "employee.read", "message.read",
  ],
}

export function hasPermission(role: string, permission: EmployeePermission): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(permission)
}

export function canManageEmployee(
  role: string,
  userId: string,
  employee: { supervisorId?: string | null; createdBy: string }
): boolean {
  if (role === "owner" || role === "admin") return true
  if (role === "member") {
    return employee.supervisorId === userId || employee.createdBy === userId
  }
  return false
}
