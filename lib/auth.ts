import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { prisma } from "@/lib/prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Agent credentials provider
    Credentials({
      id: "agent-credentials",
      name: "Agent Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const agent = await prisma.agent.findUnique({
          where: { email: credentials.email as string },
        })

        if (!agent) {
          return null
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          agent.passwordHash
        )

        if (!isPasswordValid) {
          return null
        }

        return {
          id: agent.id,
          email: agent.email,
          name: agent.name,
          userType: "agent" as const,
        }
      },
    }),

    // Customer credentials provider
    Credentials({
      id: "customer-credentials",
      name: "Customer Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const customer = await prisma.customer.findUnique({
          where: { email: credentials.email as string },
        })

        if (!customer) {
          return null
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          customer.passwordHash
        )

        if (!isPasswordValid) {
          return null
        }

        return {
          id: customer.id,
          email: customer.email,
          name: customer.firstName,
          userType: "customer" as const,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.userType = user.userType
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.userType = token.userType as "agent" | "customer"
      }
      return session
    },
  },
  pages: {
    signIn: "/agent/login",
  },
  session: {
    strategy: "jwt",
  },
})
