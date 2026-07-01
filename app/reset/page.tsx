"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;

    const next: { password?: string; confirm?: string } = {};
    if (password.length < 8) next.password = "Password must be at least 8 characters";
    if (confirm !== password) next.confirm = "Passwords don't match";
    setFieldError(next);
    setError(null);
    if (next.password || next.confirm) return;

    setPending(true);
    const res = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json().catch(() => null);
      if (data?.fields?.password) setFieldError({ password: data.fields.password });
      else setError(data?.error ?? "Something went wrong. Try again.");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>

        {done ? (
          <>
            <p className="mt-3 text-sm text-slate-600">Your password has been updated.</p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              Log in
            </Link>
          </>
        ) : !token ? (
          <>
            <p className="mt-3 text-sm text-red-700">This reset link is missing its token.</p>
            <Link
              href="/forgot"
              className="mt-6 inline-block text-sm font-medium text-sky-600 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!fieldError.password}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500 aria-[invalid=true]:border-red-400"
              />
              {fieldError.password && (
                <p role="alert" className="mt-1 text-sm text-red-700">
                  {fieldError.password}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={!!fieldError.confirm}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500 aria-[invalid=true]:border-red-400"
              />
              {fieldError.confirm && (
                <p role="alert" className="mt-1 text-sm text-red-700">
                  {fieldError.confirm}
                </p>
              )}
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
              {pending ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
