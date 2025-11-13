import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import type { NextAuthOptions } from "next-auth"

// Get environment variables
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const nextAuthSecret = process.env.NEXTAUTH_SECRET
const nextAuthUrl = process.env.NEXTAUTH_URL

// Validate environment variables
if (!googleClientId || !googleClientSecret) {
  console.error(
    `Missing Google OAuth credentials. GOOGLE_CLIENT_ID: ${googleClientId ? "SET" : "NOT SET"}, GOOGLE_CLIENT_SECRET: ${googleClientSecret ? "SET" : "NOT SET"}`
  )
}

if (!nextAuthSecret) {
  console.error("NEXTAUTH_SECRET is not set. This is required for NextAuth to work.")
}

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: googleClientId || "",
      clientSecret: googleClientSecret || "",
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Persist the OAuth access_token and id_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token
        token.idToken = account.id_token
      }
      return token
    },
    async session({ session, token }) {
      // Send properties to the client, like an access_token and id_token from a provider
      session.accessToken = token.accessToken as string
      session.idToken = token.idToken as string
      return session
    },
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: '/',
  },
  secret: nextAuthSecret,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
