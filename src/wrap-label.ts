export function wrapLabel(value: string): string {
  return value
    .split("\n")
    .flatMap((line) => {
      const characters = Array.from(line);
      if (characters.length <= 24) return [line];
      const lines: string[] = [];
      for (let index = 0; index < characters.length; index += 24)
        lines.push(characters.slice(index, index + 24).join(""));
      return lines;
    })
    .join("\n");
}
