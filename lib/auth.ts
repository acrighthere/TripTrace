import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { loginSchema } from "@/lib/validation";
import { getDummyHash, verifyPassword } from "@/lib/password";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials, request) {
        const ip = getClientIp(request.headers);
        // 10 attempts burst, then one every 6 seconds per IP.
        if (!rateLimit(`login:${ip}`, { capacity: 10, refillPerSecond: 1 / 6 })) {
          return null;
        }

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        // Always verify against some hash so the response time doesn't
        // reveal whether the email exists.
        const hash = user?.passwordHash ?? (await getDummyHash());
        const valid = await verifyPassword(hash, parsed.data.password);
        if (!valid || !user) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
});

/** Session gate for route handlers; null means respond 401. */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
