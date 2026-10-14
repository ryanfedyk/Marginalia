"use client";

import { useState } from "react";

const LABELS = ["", "Not for me", "It was fine", "Liked it", "Loved it", "A favourite"];

/** Five quiet stars. Tap the current rating again to clear it. */
export function Rating({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;

  return (
    <div className="flex flex-col items-center">
      <div role="radiogroup" aria-label="Your rating" className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? undefined : n)}
            className="p-1.5 transition-transform active:scale-90"
          >
            <svg viewBox="0 0 24 24" className="size-[22px]" aria-hidden>
              <path
                d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"
                strokeWidth="1.3"
                strokeLinejoin="round"
                className={`transition-colors duration-200 ${n <= shown ? "fill-ink stroke-ink" : "fill-transparent stroke-[#cfccc5]"}`}
              />
            </svg>
          </button>
        ))}
      </div>
      <p className="mt-0.5 h-4 text-[11px] text-faint">{shown ? LABELS[shown] : value === undefined ? "Rate it" : ""}</p>
    </div>
  );
}
