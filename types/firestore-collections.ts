import type { Timestamp } from "firebase/firestore";

import type { AppRole } from "@/types/auth";

/** Firestore collection IDs (match console / rules). */
export const COLLECTIONS = {
  USERS: "users",
  INVITE_CODES: "inviteCodes",
  /** Pending email invites; doc id = normalized lowercase email. */
  EMAIL_INVITES: "emailInvites",
  UPLOADS: "uploads",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/**
 * `users/{userId}` — profile and account metadata (keyed by Firebase Auth uid).
 */
export interface UserDocument {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: AppRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * `inviteCodes/{codeId}` — invite / access codes.
 * Prefer a stable `code` string for lookups; `codeId` may be a random doc id.
 */
export interface InviteCodeDocument {
  code: string;
  createdBy: string;
  createdAt: Timestamp;
  /** When unset, the code does not expire by time. */
  expiresAt: Timestamp | null;
  /** Max redemptions; omit or null for unlimited. */
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  /** Role granted after successful code login (defaults to `uploader` in API if missing). */
  grantedRole?: AppRole;
  /** Shown as session `name` for code logins (defaults to "Guest"). */
  guestName?: string;
  /** Admin-facing label (e.g. who the code is for). */
  label?: string;
}

/**
 * `emailInvites/{emailLower}` — first Google/email login creates `users/{uid}` and deactivates the invite.
 */
export interface EmailInviteDocument {
  /** Same as document id; lowercase trimmed email. */
  emailLower: string;
  grantedRole: AppRole;
  createdBy: string;
  createdAt: Timestamp;
  active: boolean;
  /** Optional default display name if the ID token has no `name`. */
  displayNameHint?: string | null;
  consumedAt?: Timestamp | null;
  consumedByUid?: string | null;
}

export type UploadStatus = "pending" | "approved" | "rejected";

/**
 * `uploads/{uploadId}` — metadata for files in Google Drive (app `uploads` tree).
 */
export interface UploadDocument {
  /** Google Drive file id (for camera originals, the file in the event camera folder). */
  fileId: string;
  /** Guest uploads vs event camera folder; camera originals are never moved from Drive. */
  source?: "upload" | "camera";
  /** For `source: camera`: shortcut in app `album` folder — removed on de-promote only (original untouched). */
  albumShortcutId?: string | null;
  /** When false, item stays approved in Firestore but is hidden from the public album. */
  inPublicAlbum?: boolean;
  depromotedAt?: Timestamp | null;
  repromotedAt?: Timestamp | null;
  repromotedBy?: string | null;
  uploaderName: string;
  /** e.g. `EventWebApp/uploads/jane_2026-04-02` */
  folderPath: string;
  status: UploadStatus;
  /** Set false on create; true after approval (camera files may stay in place in Drive). */
  approved?: boolean;
  driveFolderId: string;
  originalFilename: string;
  uploadedByUserId: string;
  createdAt: Timestamp;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Legacy fields (older docs) */
  storagePath?: string;
  downloadURL?: string | null;
  uploadedBy?: string;
  eventId?: string | null;
  reviewedAt?: Timestamp | null;
  reviewedBy?: string | null;
}
