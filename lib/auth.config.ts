import type { NextAuthConfig } from "next-auth";

// Edge-safe config shared with middleware.ts — must not import Prisma or
// argon2. The full config (adapter + Credentials provider) lives in lib/auth.ts.
//
// Credentials sign-in cannot use the database session strategy (Auth.js never
// persists sessions for it), so sessions are JWTs in an httpOnly,
// sameSite=lax cookie, secure in production — 30-day expiry, re-issued
// (rotated) on activity at most once a day.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") session.user.id = token.id;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [],
} satisfies NextAuthConfig;
