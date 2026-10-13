type P = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

export const PlusIcon = ({ className = "size-4" }: P) => (
  <svg {...base} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const CloseIcon = ({ className = "size-5" }: P) => (
  <svg {...base} className={className}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const BarcodeIcon = ({ className = "size-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
    <path d="M8 8v8M11 8v8M13.5 8v8M16 8v8" />
  </svg>
);
export const ShelfIcon = ({ className = "size-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M3 20h18" />
    <path d="M5 20V6h3v14M9.5 20V4h3v16M14 20l2.2-12.5 3 .5L17 20" />
  </svg>
);
export const SearchIcon = ({ className = "size-5" }: P) => (
  <svg {...base} className={className}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
);
export const TrashIcon = ({ className = "size-4" }: P) => (
  <svg {...base} className={className}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
);
export const ArrowIcon = ({ className = "size-4" }: P) => (
  <svg {...base} className={className}><path d="M7 17L17 7M9 7h8v8" /></svg>
);
export const CheckIcon = ({ className = "size-4" }: P) => (
  <svg {...base} className={className}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const SparkIcon = ({ className = "size-4" }: P) => (
  <svg {...base} className={className}>
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5L9 15M15 9l2.5-2.5" />
  </svg>
);
export const CameraIcon = ({ className = "size-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
