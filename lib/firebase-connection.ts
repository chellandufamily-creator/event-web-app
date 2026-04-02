import { doc, getDoc } from "firebase/firestore";

import { db, initFirebase, isFirebaseConfigured } from "@/lib/firebase";

/**
 * Confirms the Firebase client can reach Firestore (TLS round-trip + rules evaluation).
 * Missing documents do not throw; permission errors mean the backend responded.
 */
export async function probeFirestore(): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (!isFirebaseConfigured()) {
    return { ok: false, detail: "Missing NEXT_PUBLIC_FIREBASE_* env vars (copy .env.example to .env.local)" };
  }

  initFirebase();

  try {
    await getDoc(doc(db, "__connectivity__", "probe"));
    return { ok: true };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "permission-denied") {
      return { ok: true };
    }
    return { ok: false, detail: err.message ?? String(e) };
  }
}
