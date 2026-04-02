import { prisma } from "@/lib/prisma"
import { downloadFile } from "@/lib/s3"

export async function findUserProfileById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      avatarS3Key: true,
      createdAt: true,
    },
  })
}

export async function updateUserProfileName(userId: string, name: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { name },
    select: {
      id: true,
      name: true,
      email: true,
    },
  })
}

export async function findUserAvatarS3Key(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarS3Key: true },
  })

  return user?.avatarS3Key ?? null
}

export async function downloadAvatarByKey(key: string) {
  return downloadFile(key)
}

export async function clearUserAvatar(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { avatarS3Key: null },
    select: { id: true },
  })
}
