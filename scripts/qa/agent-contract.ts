import { z } from "zod";

const schema = z
  .object({
    contractVersion: z.literal(1),
    sentinel: z.literal("VISUAL_LEARNING_CONTRACT_OK"),
    fixtureSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type AgentContract = z.infer<typeof schema>;

export function extractContract(text: string): AgentContract {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth !== 0) continue;
        try {
          return schema.parse(JSON.parse(text.slice(start, index + 1)));
        } catch {
          break;
        }
      }
    }
  }
  throw new Error("agent output did not contain strict contract JSON");
}
