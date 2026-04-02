import { Readable } from "stream";
import { google, type drive_v3 } from "googleapis";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

export class DrivePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrivePolicyError";
  }
}

export interface DriveLayoutIds {
  rootId: string | null;
  uploadsId: string | null;
  albumId: string | null;
  /** From env; existing event folder (read-only for mutations). */
  cameraFolderId: string | null;
}

export interface DriveUploadInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface DriveFileListItem {
  id: string;
  name: string;
  mimeType?: string | null;
  size?: string | null;
  modifiedTime?: string | null;
}

/** Camera roll files — attribution is app metadata only (Drive files are not modified). */
export interface DriveCameraFileItem extends DriveFileListItem {
  uploadedBy: "CameraMan";
  source: "camera";
}

let cachedDrive: drive_v3.Drive | null = null;
let clientOverride: drive_v3.Drive | null = null;

let rootFolderIdCache: string | null = null;
let uploadsFolderIdCache: string | null = null;
let albumFolderIdCache: string | null = null;

function getConfiguredOAuth2() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google Drive OAuth env missing: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN"
    );
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob");
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function getDrive(): drive_v3.Drive {
  if (clientOverride) {
    return clientOverride;
  }
  if (!cachedDrive) {
    cachedDrive = google.drive({ version: "v3", auth: getConfiguredOAuth2() });
  }
  return cachedDrive;
}

/** Folder IDs that must never receive new files, new subfolders, deletes, or moves into them. */
export function getImmutableFolderIds(): Set<string> {
  const ids = new Set<string>();
  const extra = process.env.GOOGLE_DRIVE_IMMUTABLE_FOLDER_IDS?.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean) ?? [];
  for (const id of extra) {
    ids.add(id);
  }
  const camera = process.env.GOOGLE_DRIVE_CAMERA_FOLDER_ID?.trim();
  if (camera) {
    ids.add(camera);
  }
  return ids;
}

export function getCameraFolderIdFromEnv(): string | null {
  return process.env.GOOGLE_DRIVE_CAMERA_FOLDER_ID?.trim() || null;
}

export function isImmutableFolderId(folderId: string): boolean {
  return getImmutableFolderIds().has(folderId);
}

export function assertFolderAcceptsNewChildren(folderId: string): void {
  if (isImmutableFolderId(folderId)) {
    throw new DrivePolicyError("This folder is read-only: nothing may be added, created, or uploaded here.");
  }
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim() &&
      process.env.ROOT_FOLDER_NAME?.trim()
  );
}

function escapeDriveQueryLiteral(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findChildFolderByName(
  drive: drive_v3.Drive,
  name: string,
  parentId: string
): Promise<string | null> {
  const safe = escapeDriveQueryLiteral(name);
  const q = `name='${safe}' and mimeType='${FOLDER_MIME}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: "files(id)",
    spaces: "drive",
    pageSize: 5,
  });
  return res.data.files?.[0]?.id ?? null;
}

/** Reuse an existing child folder or create it (name must be safe for Drive queries). */
export async function findOrCreateFolder(parentId: string, name: string): Promise<{ id: string; name: string }> {
  const drive = getDrive();
  const existing = await findChildFolderByName(drive, name, parentId);
  if (existing) {
    return { id: existing, name };
  }
  return createFolder(name, parentId);
}

/**
 * Creates a folder under the given parent (use parentId `"root"` for My Drive root).
 */
export async function createFolder(name: string, parentId: string): Promise<{ id: string; name: string }> {
  assertFolderAcceptsNewChildren(parentId);
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    fields: "id, name",
  });
  if (!res.data.id || !res.data.name) {
    throw new Error("Drive API did not return folder id/name");
  }
  return { id: res.data.id, name: res.data.name };
}

export async function uploadFile(
  input: DriveUploadInput,
  folderId: string
): Promise<{ id: string; name: string; mimeType?: string | null; size?: string | null }> {
  assertFolderAcceptsNewChildren(folderId);
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: input.filename,
      parents: [folderId],
    },
    media: {
      mimeType: input.mimeType,
      body: Readable.from(input.buffer),
    },
    fields: "id, name, mimeType, size",
  });
  if (!res.data.id || !res.data.name) {
    throw new Error("Drive API did not return file id/name");
  }
  return {
    id: res.data.id,
    name: res.data.name,
    mimeType: res.data.mimeType,
    size: res.data.size,
  };
}

async function internalMoveFile(
  drive: drive_v3.Drive,
  fileId: string,
  newFolderId: string,
  currentParents: string[]
): Promise<void> {
  await drive.files.update({
    fileId,
    addParents: newFolderId,
    removeParents: currentParents.join(","),
    fields: "id, parents",
  });
}

async function getImmediateParentIds(drive: drive_v3.Drive, fileOrFolderId: string): Promise<string[]> {
  const r = await drive.files.get({ fileId: fileOrFolderId, fields: "parents" });
  return r.data.parents ?? [];
}

async function folderHasAncestor(
  drive: drive_v3.Drive,
  folderId: string,
  ancestorId: string,
  maxHops = 40
): Promise<boolean> {
  let current: string | undefined = folderId;
  for (let i = 0; i < maxHops && current; i++) {
    if (current === ancestorId) {
      return true;
    }
    const ps = await getImmediateParentIds(drive, current);
    if (ps.length === 0) {
      break;
    }
    current = ps[0];
  }
  return false;
}

/** True if the file lives under `uploadsRootId` (including nested session folders). */
export async function isFileInUploadsTree(fileId: string, uploadsRootId: string): Promise<boolean> {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: "parents" });
  const parents = meta.data.parents ?? [];
  for (const p of parents) {
    if (p === uploadsRootId) {
      return true;
    }
    if (await folderHasAncestor(drive, p, uploadsRootId)) {
      return true;
    }
  }
  return false;
}

/**
 * Move a guest upload from the app `uploads` tree into `album` (single parent, no copy).
 * Does not handle camera-folder files (those stay put; use Firestore-only approval).
 */
export async function moveGuestUploadIntoAlbum(
  fileId: string,
  albumFolderId: string,
  uploadsRootId: string
): Promise<void> {
  assertFolderAcceptsNewChildren(albumFolderId);
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: "id, parents, mimeType" });
  const parents = meta.data.parents ?? [];
  const mime = meta.data.mimeType;

  if (mime === FOLDER_MIME) {
    throw new DrivePolicyError("Folders cannot be moved into the album.");
  }
  if (mime === SHORTCUT_MIME) {
    throw new DrivePolicyError("Shortcuts cannot be moved into the album this way.");
  }
  if (parents.includes(albumFolderId)) {
    throw new DrivePolicyError("This file is already in the album folder.");
  }

  const inUploads = await isFileInUploadsTree(fileId, uploadsRootId);
  if (!inUploads) {
    throw new DrivePolicyError("File is not under the app uploads folder.");
  }

  await internalMoveFile(drive, fileId, albumFolderId, parents);
}

export async function getDriveFileMeta(fileId: string): Promise<{
  parents: string[];
  mimeType: string | null;
  name: string | null;
  size: string | null;
}> {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: "parents, mimeType, name, size" });
  return {
    parents: meta.data.parents ?? [],
    mimeType: meta.data.mimeType ?? null,
    name: meta.data.name ?? null,
    size: meta.data.size ?? null,
  };
}

/**
 * Low-level move (use {@link promoteToAlbum} for camera/uploads → album workflow).
 */
export async function moveFile(fileId: string, newFolderId: string): Promise<void> {
  assertFolderAcceptsNewChildren(newFolderId);
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: "parents" });
  const parents = meta.data.parents;
  if (!parents?.length) {
    throw new Error("File has no parents");
  }
  for (const p of parents) {
    if (isImmutableFolderId(p)) {
      throw new DrivePolicyError("Cannot move files out of a read-only folder with this API; use album promote.");
    }
  }
  await internalMoveFile(drive, fileId, newFolderId, parents);
}

export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: "parents" });
  const parents = meta.data.parents ?? [];
  for (const p of parents) {
    if (isImmutableFolderId(p)) {
      throw new DrivePolicyError("Cannot delete files inside a read-only event folder.");
    }
  }
  await drive.files.delete({ fileId });
}

export async function listFiles(folderId: string): Promise<DriveFileListItem[]> {
  const drive = getDrive();
  const q = `'${folderId}' in parents and trashed=false`;
  const out: DriveFileListItem[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
      pageSize: 200,
      pageToken,
    });
    out.push(...((res.data.files ?? []) as DriveFileListItem[]));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** List camera folder; every item is labeled as CameraMan (no Drive metadata changes). */
export async function listCameraRollWithAttribution(cameraFolderId: string): Promise<DriveCameraFileItem[]> {
  const files = await listFiles(cameraFolderId);
  return files.map((f) => ({
    ...f,
    uploadedBy: "CameraMan" as const,
    source: "camera" as const,
  }));
}

async function createAlbumShortcut(
  drive: drive_v3.Drive,
  targetFileId: string,
  displayName: string,
  albumFolderId: string
): Promise<{ id: string; name: string }> {
  assertFolderAcceptsNewChildren(albumFolderId);
  const res = await drive.files.create({
    requestBody: {
      name: displayName,
      mimeType: SHORTCUT_MIME,
      shortcutDetails: { targetId: targetFileId },
      parents: [albumFolderId],
    },
    fields: "id, name",
  });
  if (!res.data.id || !res.data.name) {
    throw new Error("Drive API did not return shortcut id/name");
  }
  return { id: res.data.id, name: res.data.name };
}

export type PromoteToAlbumResult =
  | { kind: "moved"; fileId: string }
  | { kind: "shortcut"; shortcutId: string; targetFileId: string };

/**
 * Admin/Approver workflow: originals in the camera folder stay put — we add a Drive shortcut in `album`.
 * Files in app `uploads` are moved into `album` (single parent).
 */
export async function promoteToAlbum(
  fileId: string,
  ctx: { albumFolderId: string; uploadsFolderId: string; cameraFolderId: string | null }
): Promise<PromoteToAlbumResult> {
  const { albumFolderId, uploadsFolderId, cameraFolderId } = ctx;
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: "id, name, mimeType, parents" });
  const parents = meta.data.parents ?? [];
  const mime = meta.data.mimeType;

  if (mime === FOLDER_MIME) {
    throw new DrivePolicyError("Folders cannot be promoted to the album.");
  }
  if (mime === SHORTCUT_MIME) {
    throw new DrivePolicyError("Shortcuts cannot be promoted again.");
  }
  if (parents.includes(albumFolderId)) {
    throw new DrivePolicyError("This file is already in the album folder.");
  }

  for (const p of parents) {
    if (isImmutableFolderId(p) && p !== cameraFolderId) {
      throw new DrivePolicyError("This file lives under a read-only path that is not the configured camera folder.");
    }
  }

  if (cameraFolderId && parents.includes(cameraFolderId)) {
    const name = meta.data.name ?? "Photo";
    const shortcut = await createAlbumShortcut(drive, fileId, name, albumFolderId);
    return { kind: "shortcut", shortcutId: shortcut.id, targetFileId: fileId };
  }

  if (await isFileInUploadsTree(fileId, uploadsFolderId)) {
    assertFolderAcceptsNewChildren(albumFolderId);
    const fresh = await drive.files.get({ fileId, fields: "parents" });
    const ps = fresh.data.parents ?? [];
    await internalMoveFile(drive, fileId, albumFolderId, ps);
    return { kind: "moved", fileId };
  }

  throw new DrivePolicyError(
    "File must be in the event camera folder or in the app uploads folder to be added to the album."
  );
}

/**
 * Ensures `ROOT_FOLDER_NAME` exists under My Drive, then `uploads` and `album` under it.
 * Does not create or modify the external camera event tree (`GOOGLE_DRIVE_*` / immutable IDs).
 */
export async function ensureDriveLayoutOnStartup(): Promise<DriveLayoutIds> {
  const cameraFolderId = getCameraFolderIdFromEnv();
  if (!isGoogleDriveConfigured()) {
    return { rootId: null, uploadsId: null, albumId: null, cameraFolderId };
  }
  if (rootFolderIdCache && uploadsFolderIdCache && albumFolderIdCache) {
    return {
      rootId: rootFolderIdCache,
      uploadsId: uploadsFolderIdCache,
      albumId: albumFolderIdCache,
      cameraFolderId,
    };
  }

  const drive = getDrive();
  const rootName = process.env.ROOT_FOLDER_NAME!.trim();

  let rootId = await findChildFolderByName(drive, rootName, "root");
  if (!rootId) {
    const created = await createFolder(rootName, "root");
    rootId = created.id;
  }
  rootFolderIdCache = rootId;

  let uploadsId = await findChildFolderByName(drive, "uploads", rootId);
  if (!uploadsId) {
    const c = await createFolder("uploads", rootId);
    uploadsId = c.id;
  }
  uploadsFolderIdCache = uploadsId;

  let albumId = await findChildFolderByName(drive, "album", rootId);
  if (!albumId) {
    const c = await createFolder("album", rootId);
    albumId = c.id;
  }
  albumFolderIdCache = albumId;

  return { rootId, uploadsId, albumId, cameraFolderId };
}

export function getCachedDriveLayout(): DriveLayoutIds {
  return {
    rootId: rootFolderIdCache,
    uploadsId: uploadsFolderIdCache,
    albumId: albumFolderIdCache,
    cameraFolderId: getCameraFolderIdFromEnv(),
  };
}

/** Returns cached layout or runs {@link ensureDriveLayoutOnStartup} when caches are empty. */
export async function getOrEnsureDriveLayout(): Promise<DriveLayoutIds> {
  if (rootFolderIdCache && uploadsFolderIdCache && albumFolderIdCache) {
    return getCachedDriveLayout();
  }
  return ensureDriveLayoutOnStartup();
}

const THUMB_SZ_RE = /^w([1-9]\d{1,3})$/;

export function sanitizeDriveFileId(id: string | null): string | null {
  if (!id || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return null;
  }
  return id;
}

/** `sz` for Drive thumbnails (e.g. w40, w640); max width 2000 per API. */
export function sanitizeDriveThumbnailSz(param: string | null): string | null {
  if (!param || !THUMB_SZ_RE.test(param)) {
    return null;
  }
  const w = Number.parseInt(param.slice(1), 10);
  if (w < 10 || w > 2000) {
    return null;
  }
  return param;
}

/**
 * Fetches thumbnail bytes with the app’s Drive OAuth (browser hotlinks to
 * drive.google.com/thumbnail often fail for private files).
 */
export async function fetchDriveThumbnail(
  fileId: string,
  sz: string
): Promise<
  { ok: true; buffer: Buffer; contentType: string } | { ok: false; status: number; code?: "no_thumbnail" }
> {
  const auth = getConfiguredOAuth2();
  const access = await auth.getAccessToken();
  const token = access.token;
  if (!token) {
    return { ok: false, status: 503 };
  }

  const apiUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/thumbnail?sz=${encodeURIComponent(sz)}`;
  const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } });

  if (res.ok) {
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return { ok: true, buffer, contentType };
  }

  const drive = getDrive();
  let thumbnailLink: string | null | undefined;
  try {
    const meta = await drive.files.get({
      fileId,
      fields: "thumbnailLink",
      supportsAllDrives: true,
    });
    thumbnailLink = meta.data.thumbnailLink;
  } catch {
    return { ok: false, status: res.status === 404 ? 404 : 502 };
  }

  if (!thumbnailLink) {
    return { ok: false, status: 404, code: "no_thumbnail" };
  }

  try {
    const fallback = await auth.request<ArrayBuffer>({
      url: thumbnailLink,
      responseType: "arraybuffer",
    });
    const body = fallback.data;
    const buffer = Buffer.from(body);
    const contentType = fallback.headers.get("content-type") || "image/jpeg";
    return { ok: true, buffer, contentType };
  } catch {
    return { ok: false, status: 502 };
  }
}

/** Test-only: inject a mock Drive client (or null to restore real OAuth client). */
export function setGoogleDriveClientForTests(client: drive_v3.Drive | null): void {
  clientOverride = client;
  if (!client) {
    cachedDrive = null;
  }
}

/** Test-only: clear caches and override. */
export function resetGoogleDriveModuleStateForTests(): void {
  clientOverride = null;
  cachedDrive = null;
  rootFolderIdCache = null;
  uploadsFolderIdCache = null;
  albumFolderIdCache = null;
}
