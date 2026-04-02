"use client";

import { type Analytics, getAnalytics, isSupported } from "firebase/analytics";

import { initFirebase } from "@/lib/firebase";

let cached: Analytics | null | undefined;

/**
 * Returns the Analytics instance when supported (browser + measurementId in env).
 * Call from a client component after mount if you need guaranteed availability.
 */
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (cached !== undefined) {
    return cached;
  }
  if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim()) {
    cached = null;
    return null;
  }
  const supported = await isSupported();
  if (!supported) {
    cached = null;
    return null;
  }
  const app = initFirebase();
  cached = getAnalytics(app);
  return cached;
}
