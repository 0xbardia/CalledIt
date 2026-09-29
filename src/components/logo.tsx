import { useId } from "react";

/** CalledIt mark: a bone C closed by an ember check, on a glass tile. */
export function Mark({ className = "mark" }: { className?: string }) {
  const raw = useId().replace(/:/g, "");
  const glass = `glass-${raw}`;
  const ember = `ember-${raw}`;
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={glass} x1="4" y1="0" x2="60" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.78" />
          <stop offset="0.46" stopColor="#d5deea" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ff5a36" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id={ember} x1="36" y1="24" x2="54" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe7de" />
          <stop offset="0.45" stopColor="#ff5a36" />
          <stop offset="1" stopColor="#c2411c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="#10141c" />
      <rect width="64" height="64" rx="18" fill={`url(#${glass})`} />
      <rect x="1.15" y="1.15" width="61.7" height="61.7" rx="17" fill="none" stroke="#ffffff" strokeOpacity="0.78" strokeWidth="1.3" />
      <path d="M15 12.8c8 3.4 20 3.8 30 0.2" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M26.1 20.4A12 12 0 1 0 26.1 43.6" fill="none" stroke="#F6F1E8" strokeWidth="5" strokeLinecap="round" />
      <path className="mark-tick" pathLength={1} d="M36 33.2 41.2 39.6 53 25.4" fill="none" stroke={`url(#${ember})`} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark-type">
      <span className="brand-called">Called</span>
      <span className="brand-it">It</span>
    </span>
  );
}
