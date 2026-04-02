import admin from "firebase-admin";

export function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error(
      "Server Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON in .env.local (service account JSON as a single line)."
    );
  }
  const credentials = JSON.parse(raw) as admin.ServiceAccount;
  return admin.initializeApp({
    credential: admin.credential.cert(credentials),
  });
}

export function getAdminAuth(): admin.auth.Auth {
  return getAdminApp().auth();
}

export function getAdminDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}
