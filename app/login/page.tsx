"use client";

import { useQueryClient } from "@tanstack/react-query";
import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { auth } from "@/lib/firebase";

function LoginForms() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";
  const errorParam = searchParams.get("error");

  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"code" | "email" | null>(null);
  const [message, setMessage] = useState<string | null>(
    errorParam === "forbidden" ? "You do not have access to that area." : null
  );

  async function onCodeLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading("code");
    try {
      const res = await fetch("/api/auth/code-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string; session?: unknown };
      if (!res.ok) {
        setMessage(data.error || "Code login failed");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      router.push(from.startsWith("/login") ? "/" : from);
      router.refresh();
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(null);
    }
  }

  async function onEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading("email");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/auth/email-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Email login failed");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      router.push(from.startsWith("/login") ? "/" : from);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setMessage(msg);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-10 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Use an invite code or your email account.
        </p>
      </div>

      {message ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {message}
        </p>
      ) : null}

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Secret code</h2>
        <form onSubmit={onCodeLogin} className="space-y-3">
          <input
            type="text"
            name="code"
            autoComplete="one-time-code"
            placeholder="Enter code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {loading === "code" ? "Checking…" : "Continue with code"}
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Email</h2>
        <form onSubmit={onEmailLogin} className="space-y-3">
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            {loading === "email" ? "Signing in…" : "Sign in with email"}
          </button>
        </form>
      </section>

      <p className="text-center text-sm text-zinc-500">
        <Link href="/" className="underline hover:text-zinc-800 dark:hover:text-zinc-300">
          Back to home
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-zinc-500">Loading…</div>}>
      <LoginForms />
    </Suspense>
  );
}
