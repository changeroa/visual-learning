// Stroke icons drawn from the Lucide set (ISC license), inlined so the app loads no icon font or CDN.

export type IconName = "focus-enter" | "focus-exit";

const paths: Record<IconName, readonly string[]> = {
  "focus-enter": ["M15 3h6v6", "M9 21H3v-6", "M21 3l-7 7", "M3 21l7-7"],
  "focus-exit": ["M4 14h6v6", "M20 10h-6V4", "M14 10l7-7", "M3 21l7-7"],
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
