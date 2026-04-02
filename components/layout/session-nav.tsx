"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import type { AuthSession } from "@/types/auth";

async function fetchSession(): Promise<AuthSession | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  const data = (await res.json()) as { session: AuthSession | null };
  return data.session;
}

export function SessionNav({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchSession,
    staleTime: 30_000,
  });

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    queryClient.setQueryData(["auth", "me"], null);
    router.refresh();
  }

  if (isPending) {
    return <span className={cn("text-xs text-zinc-400", className)}>…</span>;
  }

  if (!session) {
    return (
      <Link
        href="/login"
        className={cn(
          "text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50",
          className
        )}
      >
        Login
      </Link>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className="hidden max-w-[140px] truncate text-xs text-zinc-500 sm:inline dark:text-zinc-400"
        title={session.name}
      >
        {session.name}
        <span className="ml-1 text-zinc-400">({session.role})</span>
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
      >
        Log out
      </button>
    </div>
  );
}
