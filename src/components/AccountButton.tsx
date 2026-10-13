"use client";

import { useState } from "react";
import { signIn, signOut, useAccount } from "@/lib/sync";

const SYNC_LABEL = {
  idle: "Connecting…",
  syncing: "Saving to your library…",
  synced: "Library saved to your account",
  offline: "Offline — changes will sync later",
  error: "Sync paused",
} as const;

export function AccountButton() {
  const { status, user, sync, error } = useAccount();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === "disabled" || status === "loading") return null;

  if (status === "signedOut" || !user) {
    return (
      <div className="relative">
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signIn();
            setBusy(false);
          }}
        >
          <GoogleMark />
          <span className="hidden sm:inline">Sign in</span>
        </button>
        {error && (
          <p className="animate-fade-in absolute right-0 z-30 mt-2 w-72 rounded-xl border border-rule bg-paper p-3 text-xs leading-relaxed text-accent shadow-sheet">
            {error}
          </p>
        )}
      </div>
    );
  }

  const initial = (user.name ?? user.email ?? "?").trim()[0]?.toUpperCase();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative block size-10 overflow-hidden rounded-full border border-rule bg-paper-2 text-sm text-ink transition hover:border-[#cfccc5]"
        aria-label="Account"
        aria-expanded={open}
      >
        {user.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photo} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          <span className="font-serif">{initial}</span>
        )}
        {(sync === "syncing" || sync === "error" || sync === "offline") && (
          <span
            className={`absolute right-0.5 bottom-0.5 size-2 rounded-full ring-2 ring-paper ${sync === "syncing" ? "animate-pulse bg-faint" : "bg-accent"}`}
          />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="animate-sheet-up absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-rule bg-paper p-5 shadow-sheet">
            <p className="truncate font-serif text-lg text-ink-2">{user.name ?? "Your library"}</p>
            {user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
            <p className={`mt-4 text-xs ${sync === "error" ? "text-accent" : "text-muted"}`}>{error ?? SYNC_LABEL[sync]}</p>
            <button
              className="btn btn-ghost mt-5 h-9 w-full text-xs"
              onClick={async () => {
                setOpen(false);
                await signOut();
              }}
            >
              Sign out
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              Signing out removes the library from this device. It stays safe in your account.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
