"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CameraRow = {
  id: string;
  name: string;
  mimeType: string | null;
  modifiedTime: string | null;
  uploadedBy: "CameraMan";
  source: "camera";
  firestoreId: string | null;
  albumState: "none" | "pending" | "live" | "hidden";
};

const chip =
  "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

/** Must match server cap in `/api/review/camera-roll/approve`. */
const APPROVE_BATCH_SIZE = 50;

export function CameraRollReviewPanel() {
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [rows, setRows] = useState<CameraRow[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const isAdmin = role === "admin";

  const showBanner = useCallback((type: "ok" | "err", text: string) => {
    setBanner({ type, text });
    window.setTimeout(() => setBanner(null), 6000);
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const json = (await res.json()) as { session?: { role?: string } | null };
      setRole(json.session?.role ?? null);
    } catch {
      setRole(null);
    }
  }, []);

  const loadRoll = useCallback(async () => {
    setLoading(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/review/camera-roll", { credentials: "include" });
      const json = (await res.json()) as {
        files?: CameraRow[];
        folderId?: string | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load camera roll");
      }
      if (json.error) {
        setConfigError(json.error);
        setRows([]);
        setFolderId(json.folderId ?? null);
        return;
      }
      setRows(json.files ?? []);
      setFolderId(json.folderId ?? null);
      setSelected(new Set());
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Failed to load camera roll");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showBanner]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    void loadRoll();
  }, [loadRoll]);

  const approvableIds = useMemo(
    () =>
      rows.filter((r) => r.albumState === "none" || r.albumState === "pending").map((r) => r.id),
    [rows]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllApprovable = () => {
    const all = approvableIds;
    if (all.length === 0) {
      return;
    }
    const allSelected = all.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(all));
    }
  };

  const runApprove = async (fileIds: string[]) => {
    if (fileIds.length === 0) {
      return;
    }
    setBusy(true);
    let totalOk = 0;
    const allFailed: { fileId: string; error?: string }[] = [];
    try {
      for (let offset = 0; offset < fileIds.length; offset += APPROVE_BATCH_SIZE) {
        const chunk = fileIds.slice(offset, offset + APPROVE_BATCH_SIZE);
        const res = await fetch("/api/review/camera-roll/approve", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileIds: chunk }),
        });
        const json = (await res.json()) as {
          results?: { fileId: string; ok: boolean; error?: string }[];
          approved?: number;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error || "Approve failed");
        }
        const results = json.results ?? [];
        totalOk += results.filter((r) => r.ok).length;
        allFailed.push(...results.filter((r) => !r.ok));
      }

      if (allFailed.length > 0) {
        const sample = allFailed
          .slice(0, 8)
          .map((f) => `${f.fileId}: ${f.error ?? "failed"}`)
          .join("; ");
        const more = allFailed.length > 8 ? ` …and ${allFailed.length - 8} more` : "";
        showBanner("err", `${totalOk} added, ${allFailed.length} failed. ${sample}${more}`);
      } else {
        showBanner(
          "ok",
          `Added ${totalOk} to the home album (originals stay in the camera folder). Open the home page to see them.`
        );
      }
      await loadRoll();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  };

  const runDepromote = async (firestoreId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/review/camera-roll/depromote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: firestoreId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "De-promote failed");
      }
      showBanner("ok", "Removed from public album (camera file unchanged; album shortcut removed).");
      await loadRoll();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "De-promote failed");
    } finally {
      setBusy(false);
    }
  };

  const runRepromote = async (firestoreId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/review/camera-roll/repromote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: firestoreId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Re-promote failed");
      }
      showBanner("ok", "Visible on the album again.");
      await loadRoll();
    } catch (e) {
      showBanner("err", e instanceof Error ? e.message : "Re-promote failed");
    } finally {
      setBusy(false);
    }
  };

  const stateBadge = (s: CameraRow["albumState"]) => {
    switch (s) {
      case "live":
        return <span className={`${chip} border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200`}>On album</span>;
      case "hidden":
        return <span className={`${chip} border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200`}>Hidden</span>;
      case "pending":
        return <span className={`${chip} border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200`}>Pending</span>;
      default:
        return <span className={`${chip} border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`}>Not on album</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Event camera roll</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Source of truth is your Google Drive camera folder
          {folderId ? (
            <>
              {" "}
              <span className="font-mono text-xs text-zinc-500">({folderId.slice(0, 12)}…)</span>
            </>
          ) : null}
          . Use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Add to album</strong> to publish — originals stay in
          Drive; we only add a shortcut. Batches of {APPROVE_BATCH_SIZE} if you select many. Home page shows{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">Camera original</strong> (CameraMan).
        </p>
      </div>

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

      {configError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          {configError}. Set <code className="rounded bg-black/10 px-1 text-xs">GOOGLE_DRIVE_CAMERA_FOLDER_ID</code> in{" "}
          <code className="rounded bg-black/10 px-1 text-xs">.env.local</code>.
        </p>
      ) : null}

      {!configError ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={approvableIds.length > 0 && approvableIds.every((id) => selected.has(id))}
              onChange={toggleAllApprovable}
              disabled={approvableIds.length === 0 || busy}
              className="rounded border-zinc-300"
            />
            Select all not yet on album
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {approvableIds.length > 0 ? (
              <span
                className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400"
                aria-live="polite"
              >
                <span className={selected.size > 0 ? "font-semibold text-zinc-900 dark:text-zinc-100" : ""}>
                  {selected.size}
                </span>
                {" of "}
                {approvableIds.length} photo{approvableIds.length !== 1 ? "s" : ""} selected
              </span>
            ) : null}
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void runApprove([...selected])}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-emerald-700"
            >
              Add selected to album
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadRoll()}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
            >
              Refresh
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading camera folder…</p>
      ) : configError ? null : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No media files in the camera folder.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const isImage = r.mimeType?.startsWith("image/");
            const thumb = `https://drive.google.com/thumbnail?id=${r.id}&sz=w400`;
            const canApprove = r.albumState === "none" || r.albumState === "pending";
            const checked = selected.has(r.id);

            return (
              <li
                key={r.id}
                className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-950 ${
                  checked ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100" : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-900">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500">{r.mimeType ?? "File"}</div>
                  )}
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    {canApprove ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggle(r.id)}
                        className="h-4 w-4 rounded border-zinc-300 bg-white shadow"
                        aria-label={`Select ${r.name}`}
                      />
                    ) : null}
                  </div>
                  <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-1">
                    {stateBadge(r.albumState)}
                    <span className={`${chip} border-violet-400/40 bg-violet-500/15 text-violet-900 dark:text-violet-200`}>
                      Camera original
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50" title={r.name}>
                    {r.name}
                  </p>
                  <p className="text-xs text-zinc-500">CameraMan</p>
                  <p className="text-xs text-zinc-400">{r.modifiedTime ? new Date(r.modifiedTime).toLocaleString() : "—"}</p>
                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    {canApprove ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runApprove([r.id])}
                        className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-emerald-700"
                      >
                        Add to album
                      </button>
                    ) : r.albumState === "live" && r.firestoreId && isAdmin ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runDepromote(r.firestoreId!)}
                        className="w-full rounded-lg border border-amber-300 bg-amber-50 py-2 text-xs font-semibold text-amber-950 disabled:opacity-40 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                      >
                        De-promote (remove from album only)
                      </button>
                    ) : null}
                    {r.albumState === "hidden" && r.firestoreId && isAdmin ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runRepromote(r.firestoreId!)}
                        className="w-full rounded-lg bg-zinc-900 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        Re-promote to album
                      </button>
                    ) : null}
                    {r.albumState === "live" && !isAdmin ? (
                      <p className="text-center text-[11px] text-zinc-500">On album — ask an admin to de-promote if needed.</p>
                    ) : null}
                    {r.albumState === "hidden" && !isAdmin ? (
                      <p className="text-center text-[11px] text-zinc-500">Hidden from album — admin can re-promote.</p>
                    ) : null}
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
