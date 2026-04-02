/** Google Drive file ids (typical webContentLink ids). */
const DRIVE_FILE_ID_RE = /^[a-zA-Z0-9_-]{10,128}$/;

export function sanitizeDriveFileId(id: string): string | null {
  const t = id.trim();
  if (!t || !DRIVE_FILE_ID_RE.test(t)) {
    return null;
  }
  return t;
}

/** Firestore document IDs are typically alphanumeric; keep a conservative allowlist. */
const FIRESTORE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function sanitizeFirestoreDocId(id: string): string | null {
  const t = id.trim();
  if (!t || !FIRESTORE_ID_RE.test(t)) {
    return null;
  }
  return t;
}

/** Basic email check for invite + login provisioning (lowercase output). */
const LOGIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeLoginEmail(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/[\u0000-\u001F\u007F]/g, "");
  if (!t || t.length > 320 || !LOGIN_EMAIL_RE.test(t)) {
    return null;
  }
  return t;
}

/** Invite / access codes: trimmed, bounded length, no control chars. */
export function sanitizeInviteCode(raw: string, maxLen = 64): string | null {
  const t = raw.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  if (!t || t.length > maxLen) {
    return null;
  }
  return t;
}

export function truncateUtf16(str: string, maxChars: number): string {
  if (str.length <= maxChars) {
    return str;
  }
  return str.slice(0, maxChars);
}

/** Parse string array of ids for bulk APIs; cap count and validate each id. */
export function sanitizeIdList(raw: unknown, maxItems = 100): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const x of raw.slice(0, maxItems)) {
    if (typeof x !== "string") {
      continue;
    }
    const id = sanitizeFirestoreDocId(x);
    if (id) {
      out.push(id);
    }
  }
  return out;
}

/** Positive integer for optional numeric fields (e.g. maxUses). */
export function sanitizePositiveInt(raw: unknown, max: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  const n = Math.floor(raw);
  if (n < 1 || n > max) {
    return null;
  }
  return n;
}

/** Expiry days 1..maxDays. */
export function sanitizeExpiresDays(raw: unknown, maxDays = 365): number | null {
  return sanitizePositiveInt(raw, maxDays);
}
