import { type FirebaseApp, type FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { type Firestore, connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const env: Pick<
  FirebaseOptions,
  "apiKey" | "authDomain" | "projectId" | "storageBucket" | "messagingSenderId" | "appId"
> = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let firestoreEmulatorConnected = false;
let authEmulatorConnected = false;

function readConfig(): FirebaseOptions {
  const missing = (Object.keys(env) as (keyof typeof env)[]).filter((k) => !env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* in .env.local (see .env.example). Missing: ${missing.join(", ")}`
    );
  }
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim();
  return {
    apiKey: env.apiKey!,
    authDomain: env.authDomain!,
    projectId: env.projectId!,
    storageBucket: env.storageBucket!,
    messagingSenderId: env.messagingSenderId!,
    appId: env.appId!,
    ...(measurementId ? { measurementId } : {}),
  };
}

/**
 * Idempotent Firebase App initialization (safe with Next.js dev HMR).
 */
export function initFirebase(): FirebaseApp {
  if (app) {
    return app;
  }
  const options = readConfig();
  app = getApps().length > 0 ? getApp() : initializeApp(options);
  return app;
}

function getAuthLazy(): Auth {
  if (!authInstance) {
    authInstance = getAuth(initFirebase());
    if (process.env.NODE_ENV === "development" && !authEmulatorConnected) {
      const url = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL?.trim();
      if (url) {
        connectAuthEmulator(authInstance, url, { disableWarnings: true });
        authEmulatorConnected = true;
      }
    }
  }
  return authInstance;
}

function getDbLazy(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(initFirebase());

    if (process.env.NODE_ENV === "development" && !firestoreEmulatorConnected) {
      const host = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST?.trim();
      if (host) {
        const [h, p] = host.split(":");
        const port = p ? Number(p) : 8080;
        connectFirestoreEmulator(dbInstance, h || "127.0.0.1", port);
        firestoreEmulatorConnected = true;
      }
    }
  }
  return dbInstance;
}

/** Firebase Auth (client SDK). Use only from client components or client-side code paths. */
export const auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuthLazy(), prop, receiver);
  },
});

/** Firestore database instance for the default app. */
export const db = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    return Reflect.get(getDbLazy(), prop, receiver);
  },
});

/**
 * True when all required `NEXT_PUBLIC_FIREBASE_*` variables are non-empty (does not open a network connection).
 */
export function isFirebaseConfigured(): boolean {
  return (Object.keys(env) as (keyof typeof env)[]).every((k) => Boolean(env[k]?.trim()));
}
