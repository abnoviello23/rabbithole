import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
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
