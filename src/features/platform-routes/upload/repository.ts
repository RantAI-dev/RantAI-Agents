import { prisma } from "@/lib/prisma"

export async function findDashboardSessionOwner(sessionId: string) {
  return prisma.dashboardSession.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  })
}

export async function updateOrganizationLogo(organizationId: string, logoS3Key: string) {
  return prisma.organization.update({
    where: { id: organizationId },
    data: { logoS3Key },
  })
}

export async function updateUserAvatar(userId: string, avatarS3Key: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { avatarS3Key },
  })
}

export async function createFileAttachment(data: {
  s3Key: string
  filename: string
  contentType: string
  size: number
  uploadedBy: string
}) {
  return prisma.fileAttachment.create({ data })
}
