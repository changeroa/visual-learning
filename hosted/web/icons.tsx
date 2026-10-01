// Stroke icons drawn from the Lucide set (ISC license), inlined so the app loads no icon font or CDN.

export type IconName =
  | "learn"
  | "evidence"
  | "notes"
  | "panel-open"
  | "panel-close"
  | "focus-enter"
  | "focus-exit"
  | "sheet";

const paths: Record<IconName, readonly string[]> = {
  learn: ["M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"],
  evidence: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
    "M14 2v4a2 2 0 0 0 2 2h4",
    "M16 13H8",
    "M16 17H8",
    "M10 9H8",
  ],
  notes: ["M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z", "M15 3v4a2 2 0 0 0 2 2h4"],
  "panel-open": [
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
    "M15 3v18",
    "m10 15-3-3 3-3",
  ],
  "panel-close": [
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
    "M15 3v18",
    "m8 9 3 3-3 3",
  ],
  "focus-enter": ["M15 3h6v6", "M9 21H3v-6", "M21 3l-7 7", "M3 21l7-7"],
  "focus-exit": ["M4 14h6v6", "M20 10h-6V4", "M14 10l7-7", "M3 21l7-7"],
  sheet: ["m18 15-6-6-6 6"],
};

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
