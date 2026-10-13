/**
 * Firebase web config (these values are public by design; access is protected by
 * Firestore security rules — see firestore.rules).
 *
 * Paste the `firebaseConfig` object from Firebase console → Project settings → Your apps
 * into FIREBASE_CONFIG below, or provide it at run time as the FIREBASE_CONFIG env var.
 * While it is null, sign-in is hidden and the library stays on the device.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export const FIREBASE_CONFIG: FirebaseWebConfig | null = {
  apiKey: "AIzaSyAYj0iCaRyRTo7ToqrUzYs-4fCmpLhB9XE",
  authDomain: "eastern-rider-511520-d9.firebaseapp.com",
  projectId: "eastern-rider-511520-d9",
  storageBucket: "eastern-rider-511520-d9.firebasestorage.app",
  messagingSenderId: "561193017763",
  appId: "1:561193017763:web:83e77898f15230ea177a16",
};

/** Accepts either JSON or the JS object literal Firebase console shows. */
export function parseFirebaseConfig(raw: string | undefined): FirebaseWebConfig | null {
  if (!raw?.trim()) return null;
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g)) out[m[1]] = m[2];
  return out.apiKey && out.projectId && out.appId
    ? {
        apiKey: out.apiKey,
        authDomain: out.authDomain || `${out.projectId}.firebaseapp.com`,
        projectId: out.projectId,
        appId: out.appId,
        storageBucket: out.storageBucket,
        messagingSenderId: out.messagingSenderId,
      }
    : null;
}
