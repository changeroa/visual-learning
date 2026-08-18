export function wrapLabel(value: string): string {
  return value
    .split("\n")
    .flatMap((line) => {
      const characters = Array.from(line);
      if (characters.length <= 32) return [line];
      const words = line.split(/\s+/u).filter(Boolean);
      if (words.length <= 1) return [line];
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current.length === 0 ? word : `${current} ${word}`;
        if (Array.from(candidate).length <= 32 || current.length === 0) {
          current = candidate;
          continue;
        }
        lines.push(current);
        current = word;
      }
      if (current.length > 0) lines.push(current);
      return lines;
    })
    .join("\n");
}
