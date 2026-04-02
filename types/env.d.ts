declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_FIREBASE_API_KEY?: string;
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
    NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
    NEXT_PUBLIC_FIREBASE_APP_ID?: string;
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?: string;
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST?: string;
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL?: string;
    FIREBASE_SERVICE_ACCOUNT_JSON?: string;
    SESSION_SECRET?: string;
    /** Set to "1" to send Secure cookies outside production (HTTPS staging). */
    FORCE_SECURE_COOKIES?: string;
    GOOGLE_DRIVE_CLIENT_ID?: string;
    GOOGLE_DRIVE_CLIENT_SECRET?: string;
    GOOGLE_DRIVE_REFRESH_TOKEN?: string;
    ROOT_FOLDER_NAME?: string;
    /** Drive folder ID for .../101NZ6_2 (from URL). Listed as CameraMan; never mutated except via album shortcuts. */
    GOOGLE_DRIVE_CAMERA_FOLDER_ID?: string;
    /** Optional extra folder IDs (comma-separated) that cannot receive uploads/subfolders/deletes, e.g. parent event folders. */
    GOOGLE_DRIVE_IMMUTABLE_FOLDER_IDS?: string;
  }
}
