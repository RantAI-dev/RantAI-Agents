import { prisma } from "@/lib/prisma"

export async function findAcceptedMembershipsByUserId(userId: string) {
  return prisma.organizationMember.findMany({
    where: {
      userId,
      acceptedAt: { not: null },
    },
    include: {
      organization: true,
    },
    orderBy: { organization: { name: "asc" } },
  })
}

export async function findOrganizationBySlug(slug: string) {
  return prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  })
}

export async function createOrganizationWithOwner(data: {
  name: string
  slug: string
  userId: string
  userEmail: string
  userName?: string
}) {
  return prisma.organization.create({
    data: {
      name: data.name,
      slug: data.slug,
      memberships: {
        create: {
          userId: data.userId,
          userEmail: data.userEmail,
          userName: data.userName,
          role: "owner",
          acceptedAt: new Date(),
        },
      },
    },
  })
}
