"use client";

import { useCallback, useRef, useState } from "react";

type UploadResult = {
  originalFilename: string;
  ok: boolean;
  fileId?: string;
  firestoreId?: string;
  error?: string;
};

type UploadResponse = {
  folder?: { driveFolderId: string; name: string; folderPath: string };
  results?: UploadResult[];
  summary?: { total: number; succeeded: number; failed: number };
  error?: string;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uploadWithProgress(
  formData: FormData,
  onProgress: (percent: number, loaded: number, total: number) => void
): Promise<{ ok: boolean; status: number; json: UploadResponse }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.withCredentials = true;
    xhr.responseType = "text";

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)), ev.loaded, ev.total);
      } else {
        onProgress(0, ev.loaded, ev.total || 0);
      }
    };

    xhr.onload = () => {
      let json: UploadResponse = {};
      try {
        json = JSON.parse(xhr.responseText || "{}") as UploadResponse;
      } catch {
        json = { error: "Invalid response" };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json });
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });
}

export function UploadForm() {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastFolder, setLastFolder] = useState<UploadResponse["folder"] | null>(null);
  const [lastResults, setLastResults] = useState<UploadResult[] | null>(null);

  const addFiles = useCallback((list: FileList | File[]) => {
    const next = Array.from(list).filter((f) => f.size > 0);
    setItems((prev) => {
      const map = new Map<string, File>();
      const key = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;
      for (const f of prev) {
        map.set(key(f), f);
      }
      for (const f of next) {
        map.set(key(f), f);
      }
      return Array.from(map.values());
    });
    setMessage(null);
  }, []);

  const removeAt = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setProgress(0);
    setLastFolder(null);
    setLastResults(null);

    const fd = new FormData();
    for (const f of items) {
      fd.append("files", f);
    }

    try {
      const { ok, status, json } = await uploadWithProgress(fd, (p) => setProgress(p));
      if (ok) {
        setProgress(100);
      }
      if (json.folder) {
        setLastFolder(json.folder);
      }
      if (json.results) {
        setLastResults(json.results);
      }
      if (!ok) {
        setMessage(json.error || `Upload failed (${status})`);
        return;
      }
      if (json.summary && json.summary.failed > 0) {
        setMessage(`Uploaded ${json.summary.succeeded} of ${json.summary.total}. Some files were skipped — see list below.`);
      } else {
        setMessage(`Uploaded ${json.summary?.succeeded ?? items.length} file(s).`);
      }
      setItems([]);
    } catch {
      setMessage("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Upload</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Photos and videos go into a dated folder under the app uploads area. Sign in as uploader or admin.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              galleryInputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) {
              addFiles(e.dataTransfer.files);
            }
          }}
          className={[
            "flex min-h-[11rem] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragOver
              ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900/40"
              : "border-zinc-300 bg-zinc-50/80 dark:border-zinc-600 dark:bg-zinc-900/30",
          ].join(" ")}
          onClick={() => galleryInputRef.current?.click()}
        >
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Drop files here</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">or tap to choose from your library</p>
        </div>

        <input
          ref={galleryInputRef}
          type="file"
          name="files"
          multiple
          accept="image/*,video/*"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) {
              addFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />

        <input
          ref={cameraInputRef}
          type="file"
          name="camera"
          accept="image/*,video/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) {
              addFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="min-h-11 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white active:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:active:bg-white"
          >
            Choose from library
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="min-h-11 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 active:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:active:bg-zinc-800"
          >
            Use camera
          </button>
        </div>

        {items.length > 0 && (
          <ul className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
            {items.map((f, i) => (
              <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-200" title={f.name}>
                  {f.name}
                </span>
                <span className="shrink-0 text-xs text-zinc-500">{formatFileSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {busy && (
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-zinc-900 transition-[width] duration-150 dark:bg-zinc-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Uploading… {progress}%</p>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || items.length === 0}
          className="min-h-11 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-700 dark:active:bg-emerald-600"
        >
          {busy ? "Uploading…" : `Upload ${items.length || ""} file${items.length === 1 ? "" : "s"}`}
        </button>
      </form>

      {message && (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            message.startsWith("Uploaded") && !message.includes("Some")
              ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
              : "bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          }`}
        >
          {message}
        </p>
      )}

      {lastFolder && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Drive folder: <span className="font-mono text-zinc-700 dark:text-zinc-300">{lastFolder.folderPath}</span>
        </p>
      )}

      {lastResults && lastResults.some((r) => !r.ok) && (
        <ul className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/60 dark:bg-red-950/30">
          {lastResults
            .filter((r) => !r.ok)
            .map((r) => (
              <li key={r.originalFilename} className="text-red-900 dark:text-red-200">
                <span className="font-medium">{r.originalFilename}</span>
                {r.error ? `: ${r.error}` : ""}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
