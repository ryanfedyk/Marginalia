"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { create } from "zustand";
import type { FirebaseWebConfig } from "./firebase-config";
import { useLibrary } from "./store";
import type { Book, Collections, TasteProfile } from "./types";

/* ---------- Public state ---------- */

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

interface AccountState {
  /** "disabled" = Firebase isn't configured; sign-in is hidden. */
  status: "disabled" | "loading" | "signedOut" | "signedIn";
  user: { uid: string; name: string | null; email: string | null; photo: string | null } | null;
  sync: SyncStatus;
  error: string | null;
}

export const useAccount = create<AccountState>(() => ({ status: "loading", user: null, sync: "idle", error: null }));

/* ---------- Firebase bootstrap ---------- */

let auth: Auth | null = null;
let db: Firestore | null = null;

export function initAccount(config: FirebaseWebConfig | null) {
  if (!config) return useAccount.setState({ status: "disabled" });
  if (auth) return;
  const app = getApps().length ? getApp() : initializeApp(config);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  onAuthStateChanged(auth, (u) => {
    if (u) {
      useAccount.setState({
        status: "signedIn",
        user: { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL },
        error: null,
      });
      startSync(u);
    } else {
      stopSync();
      useAccount.setState({ status: "signedOut", user: null, sync: "idle" });
    }
  });
}

export async function signIn() {
  if (!auth) return;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code;
    console.warn("Sign-in failed:", code, e);
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
    } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
      useAccount.setState({ error: friendlyAuthError(code) });
    }
  }
}

export async function signOut() {
  if (!auth) return;
  // Don't lose the last few seconds of edits (but don't hang if we're offline).
  await Promise.race([flush(), new Promise((r) => setTimeout(r, 3000))]);
  stopSync();
  await fbSignOut(auth);
  // The library lives in the account now; clear it from this device.
  useLibrary.getState().resetLocal();
}

function friendlyAuthError(code?: string): string {
  if (code === "auth/unauthorized-domain")
    return "This web address isn’t authorised for sign-in yet. Add it under Firebase → Authentication → Settings → Authorized domains.";
  if (code === "auth/network-request-failed") return "Couldn’t reach Google. Check your connection and try again.";
  return "Sign-in didn’t complete. Please try again.";
}

/* ---------- Sync engine ----------
 *
 * Each book is one document at users/{uid}/books/{bookId}. Deletions are tombstones
 * ({ deleted: true, updatedAt }) so a device that was offline doesn't resurrect them.
 * Conflicts resolve per book: the newer updatedAt wins.
 */

type RemoteBook = (Book & { deleted?: false }) | { id: string; deleted: true; updatedAt: string };

let uid: string | null = null;
let unsubs: Unsubscribe[] = [];
/** What the cloud currently holds: id → updatedAt (books) and tombstoned ids. */
const cloud = new Map<string, string>();
const tombstones = new Set<string>();
let cloudProfileAt: string | null = null;
let cloudCollectionsAt: string | null = null;
let ready = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function startSync(user: User) {
  if (uid === user.uid) return;
  stopSync();
  uid = user.uid;
  const lib = useLibrary.getState();
  // A library left by a different account never leaks into this one.
  if (lib.ownerUid && lib.ownerUid !== uid) lib.resetLocal();
  useAccount.setState({ sync: "syncing" });

  const booksCol = collection(db!, "users", uid, "books");
  unsubs.push(
    onSnapshot(
      booksCol,
      { includeMetadataChanges: false },
      (snap) => {
        const upserts: Book[] = [];
        const deletions: string[] = [];
        const local = new Map(useLibrary.getState().books.map((b) => [b.id, b]));
        for (const change of snap.docChanges()) {
          if (change.type === "removed") continue;
          const r = change.doc.data() as RemoteBook;
          const id = change.doc.id;
          const l = local.get(id);
          if (r.deleted) {
            tombstones.add(id);
            cloud.delete(id);
            if (l && l.updatedAt <= r.updatedAt) deletions.push(id);
          } else {
            tombstones.delete(id);
            cloud.set(id, r.updatedAt);
            if (!l || r.updatedAt > l.updatedAt) upserts.push({ ...(r as Book), id });
          }
        }
        if (upserts.length || deletions.length) useLibrary.getState().applyRemote(upserts, deletions);
        if (!ready) {
          ready = true;
          useLibrary.getState().setOwner(uid);
        }
        scheduleFlush(0);
      },
      (err) => {
        console.error(err);
        useAccount.setState({ sync: "error", error: "Couldn’t sync your library. Changes are kept on this device." });
      },
    ),
  );

  unsubs.push(
    onSnapshot(doc(db!, "users", uid), (snap) => {
      const data = snap.data();
      const remote = data?.profile as TasteProfile | undefined;
      if (remote) {
        cloudProfileAt = remote.generatedAt;
        const local = useLibrary.getState().profile;
        if (!local || remote.generatedAt > local.generatedAt) useLibrary.getState().setProfile(remote);
      }
      const remoteCols = data?.collections as Collections | undefined;
      if (remoteCols) {
        cloudCollectionsAt = remoteCols.generatedAt;
        const local = useLibrary.getState().collections;
        if (!local || remoteCols.generatedAt > local.generatedAt) useLibrary.getState().setCollections(remoteCols);
      }
    }),
  );

  unsubs.push(
    useLibrary.subscribe((s, prev) => {
      if (s.books !== prev.books || s.profile !== prev.profile || s.collections !== prev.collections) scheduleFlush(1200);
    }),
  );

  const online = () => useAccount.setState((a) => ({ sync: a.sync === "offline" ? "syncing" : a.sync }));
  const offline = () => useAccount.setState({ sync: "offline" });
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  unsubs.push(() => {
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
  });
}

function stopSync() {
  unsubs.forEach((u) => u());
  unsubs = [];
  if (timer) clearTimeout(timer);
  timer = null;
  cloud.clear();
  tombstones.clear();
  cloudProfileAt = null;
  cloudCollectionsAt = null;
  ready = false;
  uid = null;
}

function scheduleFlush(delay: number) {
  if (!ready) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

async function flush() {
  if (!uid || !db || !ready) return;
  timer = null;
  const { books, profile, collections } = useLibrary.getState();
  const now = new Date().toISOString();
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  const localIds = new Set<string>();

  for (const b of books) {
    localIds.add(b.id);
    if (cloud.get(b.id) !== b.updatedAt) writes.push({ id: b.id, data: { ...b, deleted: false } });
  }
  for (const id of cloud.keys()) {
    if (!localIds.has(id)) writes.push({ id, data: { id, deleted: true, updatedAt: now } });
  }
  const pushProfile = profile && profile.generatedAt !== cloudProfileAt;
  const pushCollections = collections && collections.generatedAt !== cloudCollectionsAt;
  const userDoc: Record<string, unknown> = {};
  if (pushProfile) userDoc.profile = profile;
  if (pushCollections) userDoc.collections = collections;
  const pushUser = Object.keys(userDoc).length > 0;
  if (!writes.length && !pushUser) {
    if (navigator.onLine) useAccount.setState({ sync: "synced" });
    return;
  }

  // Record the new cloud state up front: Firestore queues writes locally and delivers them
  // when back online, so commits may not resolve until then.
  for (const w of writes) {
    if (w.data.deleted) {
      cloud.delete(w.id);
      tombstones.add(w.id);
    } else cloud.set(w.id, w.data.updatedAt as string);
  }
  if (pushProfile) cloudProfileAt = profile!.generatedAt;
  if (pushCollections) cloudCollectionsAt = collections!.generatedAt;

  useAccount.setState({ sync: navigator.onLine ? "syncing" : "offline" });
  const commits: Promise<void>[] = [];
  for (let i = 0; i < Math.max(writes.length, 1); i += 400) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + 400)) batch.set(doc(db, "users", uid, "books", w.id), w.data);
    if (i === 0 && pushUser) batch.set(doc(db, "users", uid), userDoc, { merge: true });
    commits.push(batch.commit());
  }
  try {
    await Promise.all(commits);
    useAccount.setState({ sync: "synced", error: null });
  } catch (e) {
    console.error(e);
    useAccount.setState({ sync: "error", error: "Couldn’t save to the cloud. Changes are kept on this device." });
  }
}
