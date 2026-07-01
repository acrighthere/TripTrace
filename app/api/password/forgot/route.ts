import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { forgotPasswordSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  // Per-IP only (not per-email), so a 429 never reveals whether an email exists.
  if (!rateLimit(`forgot:${ip}`, { capacity: 5, refillPerSecond: 1 / 60 })) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  // Anti-enumeration: same 200 response whether or not the email is valid/known.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true },
  });

  if (user) {
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    // Only the newest link stays valid.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });

    const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
    const link = `${base}/reset?token=${raw}`;
    await sendMail({
      to: user.email,
      subject: "Reset your TripTrace password",
      text:
        `Someone asked to reset the password for your TripTrace account.\n\n` +
        `Open this link to choose a new password (valid for 1 hour):\n${link}\n\n` +
        `If you didn't request this, you can ignore this email.`,
    });
  }

  return NextResponse.json({ ok: true });
}
