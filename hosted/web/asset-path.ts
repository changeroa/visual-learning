// Built as its own classic script and loaded by index.html before the main.js module, so
// window.EXCALIDRAW_ASSET_PATH is set before @excalidraw/excalidraw evaluates and registers its
// fonts, and fonts load from this origin.
(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = "/";

// Excalidraw 0.18 always appends an esm.sh CDN URL to every font's source list, and browsers
// request it even when the same-origin copy exists. Drop cross-origin url() sources so the app
// never contacts a CDN; data: and same-origin sources are kept.
const NativeFontFace = window.FontFace;

function sameOriginSources(source: string): string {
  const parts = source.split(/,\s*(?=url\()/);
  const kept = parts.filter((part) => {
    const match = part.match(/^\s*url\((['"]?)(.*?)\1\)/);
    if (match === null) return true;
    const target = match[2] ?? "";
    if (target.startsWith("data:")) return true;
    try {
      return new URL(target, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  });
  return kept.length === 0 ? source : kept.join(", ");
}

window.FontFace = class extends NativeFontFace {
  constructor(family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors) {
    super(family, typeof source === "string" ? sameOriginSources(source) : source, descriptors);
  }
};
