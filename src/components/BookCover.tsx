"use client";

import { useState } from "react";

const PAPERS = ["#ece6da", "#e3e6e1", "#e9e1dc", "#dfe3e8", "#ebe5d3", "#e4dfe6"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Cover art with a quiet typographic fallback for books without canonical art.
 * Always 2:3 so the gallery stays calm.
 */
export function BookCover({
  title,
  author,
  src,
  className = "",
  size = "md",
}: {
  title: string;
  author?: string;
  src?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = src && !failed;
  const paper = PAPERS[hash(title) % PAPERS.length];
  const titleSize = size === "lg" ? "text-xl" : size === "sm" ? "text-[11px]" : "text-[15px]";

  return (
    <div
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-[3px] shadow-cover ${className}`}
      style={{ background: paper }}
    >
      {!showImage || !loaded ? (
        <div className="absolute inset-0 flex flex-col justify-between p-[10%]">
          <div className="h-px w-1/3 bg-ink/25" />
          <div>
            <p className={`font-serif leading-[1.15] text-ink-2 ${titleSize} line-clamp-5`}>{title}</p>
            {author && size !== "sm" && (
              <p className="mt-2 text-[10px] tracking-[0.12em] text-muted uppercase line-clamp-2">{author}</p>
            )}
          </div>
        </div>
      ) : null}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Cover of ${title}`}
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            // Open Library serves a 1×1 placeholder when art is missing.
            if (e.currentTarget.naturalWidth < 10) setFailed(true);
            else setLoaded(true);
          }}
          onError={() => setFailed(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {/* Spine highlight — a whisper of physicality. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/[0.07] via-white/[0.06] to-transparent" />
    </div>
  );
}
