import Link from "next/link";

import { SessionNav } from "@/components/layout/session-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

export function Header({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80",
        className
      )}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Event Web App
        </Link>
        <div className="flex items-center gap-4">
          <nav className="hidden gap-3 text-sm sm:flex">
            <Link href="/admin" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Admin
            </Link>
            <Link href="/review" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Review
            </Link>
            <Link href="/upload" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Upload
            </Link>
          </nav>
          <SessionNav />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
