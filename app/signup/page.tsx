"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;

    const nextFieldError: { email?: string; password?: string } = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextFieldError.email = "Enter a valid email address";
    if (password.length < 8) nextFieldError.password = "Password must be at least 8 characters";
    setFieldError(nextFieldError);
    setError(null);
    if (nextFieldError.email || nextFieldError.password) return;

    setPending(true);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.fields) setFieldError(data.fields);
      setError(data?.fields ? null : data?.error ?? "Something went wrong. Try again.");
      setPending(false);
      return;
    }

    const login = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });
    if (login?.error) {
      // Account exists but auto-login failed; send them to the login page.
      router.push("/login");
      return;
    }
    router.push("/map");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">TripTrace</h1>
        <p className="mt-1 text-sm text-slate-500">Create an account to start pinning your trips.</p>

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
              aria-invalid={!!fieldError.email}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500 aria-[invalid=true]:border-red-400"
            />
            {fieldError.email && (
              <p role="alert" className="mt-1 text-sm text-red-700">
                {fieldError.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldError.password}
              aria-describedby="password-hint"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500 aria-[invalid=true]:border-red-400"
            />
            <p id="password-hint" className="mt-1 text-xs text-slate-400">
              At least 8 characters.
            </p>
            {fieldError.password && (
              <p role="alert" className="mt-1 text-sm text-red-700">
                {fieldError.password}
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
            {pending ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-sky-600 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
