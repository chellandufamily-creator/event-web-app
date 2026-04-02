export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  // Intentionally do not import `services/googleDrive` here: dynamic relative paths break under `.next/`,
  // and bundling `@/services/googleDrive` pulls `googleapis` into this graph (fails on Node `http`, etc.).
  // Folder layout is ensured on first use via `getOrEnsureDriveLayout()` in `services/googleDrive.ts`.
}
