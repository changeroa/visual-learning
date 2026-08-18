import { InputError } from "./errors";

export type ParsedOptions = {
  readonly values: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
  readonly json: boolean;
};

export function parseOptions(
  argv: readonly string[],
  allowed: ReadonlySet<string>,
  booleanFlags: ReadonlySet<string> = new Set(),
): ParsedOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--json") {
      if (json) throw new InputError("--json may be supplied once");
      json = true;
      continue;
    }
    if (flag === undefined || !flag.startsWith("--") || !allowed.has(flag)) {
      throw new InputError(`unknown option: ${flag ?? "<missing>"}`);
    }
    if (booleanFlags.has(flag)) {
      if (flags.has(flag)) throw new InputError(`${flag} may be supplied once`);
      flags.add(flag);
      continue;
    }
    if (values.has(flag)) throw new InputError(`${flag} may be supplied once`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new InputError(`${flag} requires a value`);
    values.set(flag, value);
    index += 1;
  }
  return { values, flags, json };
}

export function required(options: ParsedOptions, flag: string): string {
  const value = options.values.get(flag);
  if (value === undefined) throw new InputError(`${flag} is required`);
  return value;
}

export function optional(options: ParsedOptions, flag: string): string | undefined {
  return options.values.get(flag);
}
