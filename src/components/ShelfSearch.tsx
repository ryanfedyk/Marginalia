"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "./icons";

/** A magnifier that opens into a search field; folds away again when empty. */
export function ShelfSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(Boolean(value));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const close = () => {
    onChange("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Search your shelf"
        title="Search your shelf"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-paper-2 hover:text-ink"
      >
        <SearchIcon className="size-4" />
      </button>
    );
  }

  return (
    <div className="animate-fade-in relative min-w-0 flex-1 sm:w-56 sm:flex-none">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => !value && setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
        placeholder="Title or author"
        aria-label="Search your shelf by title or author"
        className="h-8 w-full rounded-full border border-rule bg-paper pr-8 pl-7 text-sm text-ink placeholder:text-faint focus:border-[#cfccc5] focus:outline-none"
      />
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={close}
        aria-label="Clear and close search"
        className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-faint transition hover:bg-paper-3 hover:text-ink"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
}
