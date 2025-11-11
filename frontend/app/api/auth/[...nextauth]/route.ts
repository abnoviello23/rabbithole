import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

// Validate environment variables
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

if (!googleClientId || !googleClientSecret) {
  throw new Error(
    `Missing Google OAuth credentials. GOOGLE_CLIENT_ID: ${googleClientId ? "SET" : "NOT SET"}, GOOGLE_CLIENT_SECRET: ${googleClientSecret ? "SET" : "NOT SET"}. Please check your .env file and restart the dev server.`
  )
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
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
})

export { handler as GET, handler as POST }
