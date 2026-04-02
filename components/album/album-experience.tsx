"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { AlbumItem } from "@/types/album";
import type { AuthSession } from "@/types/auth";

async function fetchAlbum(): Promise<AlbumItem[]> {
  const res = await fetch("/api/album", { credentials: "include" });
  const json = (await res.json()) as { items?: AlbumItem[]; error?: string };
  if (!res.ok) {
    throw new Error(json.error || "Could not load album");
  }
  return json.items ?? [];
}

async function fetchSession(): Promise<AuthSession | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  const data = (await res.json()) as { session: AuthSession | null };
  return data.session;
}

function formatDayLabel(iso: string | null): string {
  if (!iso) {
    return "Undated";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "Undated";
  }
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function dayKey(iso: string | null): string {
  if (!iso) {
    return "_";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "_";
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function groupByDay(items: AlbumItem[]): { key: string; label: string; items: AlbumItem[] }[] {
  const map = new Map<string, AlbumItem[]>();
  for (const item of items) {
    const k = dayKey(item.createdAt);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  const entries = [...map.entries()].sort(([a], [b]) => {
    if (a === "_") {
      return 1;
    }
    if (b === "_") {
      return -1;
    }
    return b.localeCompare(a);
  });
  return entries.map(([key, groupItems]) => ({
    key,
    label: formatDayLabel(groupItems[0]?.createdAt ?? null),
    items: groupItems,
  }));
}

function PlayBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm",
        className
      )}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
        <path d="M8 5v14l11-7L8 5z" />
      </svg>
    </div>
  );
}

function AlbumTile({
  item,
  index,
  onOpen,
  reduceMotion,
}: {
  item: AlbumItem;
  index: number;
  onOpen: () => void;
  reduceMotion: boolean | null;
}) {
  const [hiResLoaded, setHiResLoaded] = useState(false);

  return (
    <motion.button
      type="button"
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "80px" }}
      transition={{ duration: reduceMotion ? 0 : 0.45, delay: Math.min(index * 0.03, 0.45), ease: [0.22, 1, 0.36, 1] }}
      onClick={onOpen}
      className="group mb-4 block w-full break-inside-avoid text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e] dark:focus-visible:ring-offset-[#0c0c0e]"
    >
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/10 transition-transform duration-500 ease-out group-hover:ring-amber-200/25 group-hover:shadow-[0_28px_60px_-24px_rgba(251,191,36,0.12)]">
        {/* Blur-up placeholder */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.blurThumbUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl"
          aria-hidden
        />
        {item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbUrl}
            alt={item.originalFilename}
            loading="lazy"
            decoding="async"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            onLoad={() => setHiResLoaded(true)}
            className={cn(
              "relative z-[1] h-auto w-full object-cover transition-all duration-700 ease-out",
              hiResLoaded ? "opacity-100" : "opacity-0"
            )}
          />
        ) : (
          <div className="relative z-[1] aspect-video w-full bg-zinc-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setHiResLoaded(true)}
              className={cn(
                "h-full w-full object-cover transition-opacity duration-700",
                hiResLoaded ? "opacity-100" : "opacity-0"
              )}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>
        )}
        {item.source === "camera" ? (
          <div className="pointer-events-none absolute left-3 top-3 z-[2] rounded-full border border-violet-400/50 bg-violet-950/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-100 backdrop-blur-sm">
            Camera original
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pt-16 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <p className="truncate text-sm font-medium text-white">{item.originalFilename}</p>
          {item.uploaderName ? (
            <p className="truncate text-xs text-white/70">{item.uploaderName}</p>
          ) : null}
        </div>
        {item.kind === "video" ? <PlayBadge /> : null}
      </div>
    </motion.button>
  );
}

function MasonryGrid({
  items,
  onOpen,
  reduceMotion,
  getGlobalIndex,
}: {
  items: AlbumItem[];
  onOpen: (globalIndex: number) => void;
  reduceMotion: boolean | null;
  getGlobalIndex: (localIndex: number) => number;
}) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
      {items.map((item, localI) => (
        <AlbumTile
          key={item.id}
          item={item}
          index={localI}
          onOpen={() => {
            onOpen(getGlobalIndex(localI));
          }}
          reduceMotion={reduceMotion}
        />
      ))}
    </div>
  );
}

function LightboxImageBody({ item }: { item: AlbumItem }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.blurThumbUrl}
        alt=""
        className="absolute max-h-full max-w-full scale-110 object-contain blur-3xl opacity-40"
        aria-hidden
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.viewUrl}
        alt={item.originalFilename}
        className={cn(
          "relative z-[1] max-h-[calc(100vh-9rem)] max-w-full rounded-lg object-contain shadow-2xl transition-opacity duration-700",
          loaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function Lightbox({
  items,
  index,
  onClose,
  onPrev,
  onNext,
  reduceMotion,
}: {
  items: AlbumItem[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  reduceMotion: boolean | null;
}) {
  const item = items[index];
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      if (e.key === "ArrowLeft") {
        onPrev();
      }
      if (e.key === "ArrowRight") {
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = e.touches[0]?.clientX ?? null;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart.current == null) {
        return;
      }
      const end = e.changedTouches[0]?.clientX ?? touchStart.current;
      const dx = end - touchStart.current;
      touchStart.current = null;
      if (dx < -56) {
        onNext();
      } else if (dx > 56) {
        onPrev();
      }
    },
    [onNext, onPrev]
  );

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!item) {
    return null;
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen media"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.25 }}
      className="fixed inset-0 z-[100] flex flex-col bg-[#050506]/97 backdrop-blur-xl"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate font-[family-name:var(--font-album-display)] text-lg font-medium tracking-tight text-zinc-100">
            {item.originalFilename}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {item.source === "camera" ? "Camera original · " : null}
            {item.uploaderName ? `${item.uploaderName} · ` : ""}
            {index + 1} / {items.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            className="rounded-full p-2.5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Previous"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-full p-2.5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Next"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded-full p-2.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6 sm:px-8">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={item.id}
            initial={reduceMotion ? false : { opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -28 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-full max-h-[calc(100vh-8rem)] w-full max-w-6xl items-center justify-center"
          >
            {item.kind === "video" ? (
              <iframe
                title={item.originalFilename}
                src={item.viewUrl}
                className="h-full w-full max-h-[72vh] rounded-xl border border-white/10 bg-black shadow-2xl"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            ) : (
              <LightboxImageBody item={item} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="pb-6 text-center text-[11px] text-zinc-600 sm:hidden">Swipe left or right to navigate</p>
    </motion.div>
  );
}

export function AlbumExperience() {
  const reduceMotion = useReducedMotion();
  const { data: session, isPending: authPending } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchSession,
    staleTime: 30_000,
  });

  const { data: items = [], isPending, isError, error, refetch } = useQuery({
    queryKey: ["album"],
    queryFn: fetchAlbum,
    staleTime: 45_000,
  });

  const [view, setView] = useState<"timeline" | "continuous">("timeline");
  const [sourceFilter, setSourceFilter] = useState<"all" | "camera" | "guest">("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const displayItems = useMemo(() => {
    if (sourceFilter === "all") {
      return items;
    }
    if (sourceFilter === "camera") {
      return items.filter((i) => i.source === "camera");
    }
    return items.filter((i) => i.source === "upload");
  }, [items, sourceFilter]);

  const flatIndices = useMemo(() => {
    const list = [...displayItems];
    return list;
  }, [displayItems]);

  const groups = useMemo(() => groupByDay(displayItems), [displayItems]);

  const resolveGlobalIndex = useCallback(
    (sectionItems: AlbumItem[], localIndex: number) => {
      const id = sectionItems[localIndex]?.id;
      if (!id) {
        return 0;
      }
      const i = flatIndices.findIndex((x) => x.id === id);
      return i >= 0 ? i : 0;
    },
    [flatIndices]
  );

  const openAt = useCallback((globalIndex: number) => {
    setOpenIndex(globalIndex);
  }, []);

  const closeLightbox = useCallback(() => setOpenIndex(null), []);

  const goPrev = useCallback(() => {
    setOpenIndex((i) => {
      if (i == null || flatIndices.length === 0) {
        return i;
      }
      return (i - 1 + flatIndices.length) % flatIndices.length;
    });
  }, [flatIndices.length]);

  const goNext = useCallback(() => {
    setOpenIndex((i) => {
      if (i == null || flatIndices.length === 0) {
        return i;
      }
      return (i + 1) % flatIndices.length;
    });
  }, [flatIndices.length]);

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[#0c0c0e] text-zinc-200">
      <header className="border-b border-white/[0.06] bg-[#0c0c0e] px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-amber-500/90">Event album</p>
            <h1 className="mt-1 font-[family-name:var(--font-album-display)] text-3xl font-light tracking-tight text-white sm:text-4xl">
              Moments
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
              Approved memories from our guests. Open any tile for fullscreen — swipe on your phone.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full border border-white/10 bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setView("timeline")}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-medium transition",
                  view === "timeline" ? "bg-amber-500/20 text-amber-200" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Timeline
              </button>
              <button
                type="button"
                onClick={() => setView("continuous")}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-medium transition",
                  view === "continuous" ? "bg-amber-500/20 text-amber-200" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Gallery
              </button>
            </div>
            <div className="flex flex-wrap rounded-full border border-white/10 bg-black/30 p-1">
              {(
                [
                  ["all", "All"],
                  ["camera", "Camera originals"],
                  ["guest", "Guest uploads"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSourceFilter(key)}
                  className={cn(
                    "rounded-full px-3 py-2 text-xs font-medium transition",
                    sourceFilter === key ? "bg-violet-500/25 text-violet-100" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Link
              href="/upload"
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:border-amber-500/40 hover:text-white"
            >
              Upload
            </Link>
            {!session && !authPending ? (
              <Link
                href="/login?from=/"
                className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/15"
              >
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-10 sm:px-8 sm:py-14">
        {isPending ? (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="mb-4 break-inside-avoid animate-pulse rounded-2xl bg-zinc-800/80"
                style={{ height: 140 + (i % 5) * 36 }}
              />
            ))}
          </div>
        ) : null}

        {isError ? (
          <div className="mx-auto max-w-md rounded-2xl border border-red-500/20 bg-red-950/30 px-6 py-8 text-center">
            <p className="text-sm text-red-200/90">{error instanceof Error ? error.message : "Something went wrong"}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 rounded-full bg-white/10 px-5 py-2 text-xs font-medium text-white transition hover:bg-white/15"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!isPending && !isError && displayItems.length === 0 && items.length > 0 ? (
          <div className="mx-auto max-w-lg py-16 text-center">
            <p className="text-sm text-zinc-500">Nothing in this filter. Try another tab above.</p>
          </div>
        ) : null}

        {!isPending && !isError && items.length === 0 ? (
          <div className="mx-auto max-w-lg py-20 text-center">
            <p className="font-[family-name:var(--font-album-display)] text-2xl font-light text-zinc-400">No photos yet</p>
            <p className="mt-3 text-sm text-zinc-600">When moderators approve uploads, they will appear here.</p>
          </div>
        ) : null}

        {!isPending && !isError && view === "continuous" && displayItems.length > 0 ? (
          <MasonryGrid
            items={displayItems}
            onOpen={openAt}
            reduceMotion={reduceMotion}
            getGlobalIndex={(localI) => localI}
          />
        ) : null}

        {!isPending && !isError && view === "timeline" && displayItems.length > 0
          ? groups.map((g) => (
              <section key={g.key} className="mb-14 last:mb-0">
                <h2 className="sticky top-14 z-20 mb-6 inline-block rounded-full border border-white/10 bg-[#0c0c0e]/95 px-5 py-2 font-[family-name:var(--font-album-display)] text-lg font-light tracking-wide text-zinc-200 shadow-sm backdrop-blur-md">
                  {g.label}
                </h2>
                <MasonryGrid
                  items={g.items}
                  onOpen={openAt}
                  reduceMotion={reduceMotion}
                  getGlobalIndex={(localI) => resolveGlobalIndex(g.items, localI)}
                />
              </section>
            ))
          : null}
      </main>

      <AnimatePresence>
        {openIndex != null && flatIndices.length > 0 ? (
          <Lightbox
            items={flatIndices}
            index={openIndex}
            onClose={closeLightbox}
            onPrev={goPrev}
            onNext={goNext}
            reduceMotion={reduceMotion}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
