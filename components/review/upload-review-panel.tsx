"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type UploadRow = {
  id: string;
  fileId: string;
  originalFilename: string;
  uploaderName: string;
  folderPath: string;
  status: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
  thumbnailUrl: string | null;
};

const filterChip =
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors data-[on=true]:border-zinc-900 data-[on=true]:bg-zinc-900 data-[on=true]:text-white dark:data-[on=true]:border-zinc-100 dark:data-[on=true]:bg-zinc-100 dark:data-[on=true]:text-zinc-900 data-[on=false]:border-zinc-200 data-[on=false]:bg-white data-[on=false]:text-zinc-700 dark:data-[on=false]:border-zinc-700 dark:data-[on=false]:bg-zinc-950 dark:data-[on=false]:text-zinc-300";

function formatBytes(n: number | null) {
  if (n == null || n < 0) {
    return "—";
  }
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${Math.round(n / 1024)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadReviewPanel() {
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [uploadFilter, setUploadFilter] = useState<"pending" | "approved" | "all">("pending");
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<string>>(() => new Set());
  const [statusBusy, setStatusBusy] = useState(false);

  const showBanner = useCallback((type: "ok" | "err", text: string) => {
    setBanner({ type, text });
    window.setTimeout(() => setBanner(null), 5000);
  }, []);

  const loadUploads = useCallback(async () => {
    setUploadsLoading(true);
    try {
      const q = uploadFilter === "all" ? "all" : uploadFilter;
      const res = await fetch(
        `/api/admin/uploads?status=${encodeURIComponent(q)}&guestOnly=1`,
        { credentials: "include" }
      );
      const json = (await res.json()) as { uploads?: UploadRow[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load uploads");
      }
      setUploads(json.uploads ?? []);
      setSelectedUploadIds(new Set());
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Failed to load uploads");
    } finally {
      setUploadsLoading(false);
    }
  }, [uploadFilter, showBanner]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  const visibleIds = useMemo(() => uploads.map((u) => u.id), [uploads]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedUploadIds.has(id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedUploadIds(new Set());
    } else {
      setSelectedUploadIds(new Set(visibleIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedUploadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  type ReviewResult = { id: string; ok: boolean; error?: string };

  const runApprove = async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    setStatusBusy(true);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = (await res.json()) as { results?: ReviewResult[]; approved?: number; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Approve failed");
      }
      const failed = json.results?.filter((r) => !r.ok) ?? [];
      if (failed.length > 0) {
        showBanner("err", failed.map((f) => `${f.id}: ${f.error ?? "failed"}`).join("; "));
      } else {
        showBanner("ok", `Approved ${json.approved ?? ids.length} upload(s).`);
      }
      await loadUploads();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Approve failed");
    } finally {
      setStatusBusy(false);
    }
  };

  const runReject = async (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    setStatusBusy(true);
    try {
      const res = await fetch("/api/reject", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = (await res.json()) as { results?: ReviewResult[]; rejected?: number; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Reject failed");
      }
      const failed = json.results?.filter((r) => !r.ok) ?? [];
      if (failed.length > 0) {
        showBanner("err", failed.map((f) => `${f.id}: ${f.error ?? "failed"}`).join("; "));
      } else {
        showBanner("ok", `Rejected ${json.rejected ?? ids.length} upload(s).`);
      }
      await loadUploads();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Reject failed");
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {banner ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["pending", "Pending"],
              ["approved", "Approved"],
              ["all", "All"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              data-on={uploadFilter === value}
              className={filterChip}
              onClick={() => setUploadFilter(value)}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="rounded border-zinc-300" />
            Select all visible
          </label>
          <button
            type="button"
            disabled={statusBusy || selectedUploadIds.size === 0}
            onClick={() => void runApprove([...selectedUploadIds])}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-emerald-700"
          >
            Approve selected
          </button>
          <button
            type="button"
            disabled={statusBusy || selectedUploadIds.size === 0}
            onClick={() => void runReject([...selectedUploadIds])}
            className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          >
            Reject selected
          </button>
        </div>
      </div>

      {uploadsLoading ? (
        <p className="text-sm text-zinc-500">Loading uploads…</p>
      ) : uploads.length === 0 ? (
        <p className="text-sm text-zinc-500">No uploads in this view.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {uploads.map((u) => {
            const checked = selectedUploadIds.has(u.id);
            const isImage = u.mimeType?.startsWith("image/");
            return (
              <li
                key={u.id}
                className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-950 ${
                  checked ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100" : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-900">
                  {u.thumbnailUrl && isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500">{u.mimeType ?? "File"}</div>
                  )}
                  <div className="absolute left-2 top-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(u.id)}
                      className="h-4 w-4 rounded border-zinc-300 bg-white shadow"
                      aria-label={`Select ${u.originalFilename}`}
                    />
                  </div>
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
                    {u.status}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50" title={u.originalFilename}>
                    {u.originalFilename || "Untitled"}
                  </p>
                  <p className="text-xs text-zinc-500">{u.uploaderName}</p>
                  <p className="text-xs text-zinc-400">
                    {formatBytes(u.sizeBytes)} · {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}
                  </p>
                  <div className="mt-auto flex gap-2 pt-2">
                    <button
                      type="button"
                      disabled={statusBusy || u.status === "approved"}
                          onClick={() => void runApprove([u.id])}
                      className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={statusBusy || u.status === "rejected"}
                          onClick={() => void runReject([u.id])}
                      className="flex-1 rounded-lg border border-zinc-200 py-2 text-xs font-semibold text-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
