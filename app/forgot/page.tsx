"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!email.trim()) {
      setError("Enter your email");
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (res.ok) {
      setSent(true);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Try again.");
    }
    setPending(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>

        {sent ? (
          <>
            <p className="mt-3 text-sm text-slate-600">
              If an account exists for that email, a reset link is on its way. The link is valid
              for one hour.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block text-sm font-medium text-sky-600 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              ← Back to log in
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="block text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Remembered it?{" "}
              <Link href="/login" className="font-medium text-sky-600 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500">
                Log in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
