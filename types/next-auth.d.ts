import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      userType: "agent" | "customer"
    }
  }

  interface User {
    id: string
    email: string
    name: string
    userType: "agent" | "customer"
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    userType: "agent" | "customer"
  }
}
