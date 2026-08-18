const clientNames = ["senpi", "codex", "claude"] as const;
export type DiscoveryClient = (typeof clientNames)[number];

export interface DiscoveryOptions {
  clients: DiscoveryClient[];
  executeContracts: DiscoveryClient[];
  structuralOnly: DiscoveryClient[];
  contractCommand: string;
  version: number;
  sentinel: string;
  out: string;
}

function required(argv: readonly string[], index: number): string {
  const result = argv[index + 1];
  if (result === undefined || result.startsWith("--"))
    throw new Error(`${argv[index]} requires a value`);
  return result;
}

function clients(value: string, option: string): DiscoveryClient[] {
  const values = value.split(",");
  if (
    values.length === 0 ||
    values.some((value) => !clientNames.includes(value as DiscoveryClient)) ||
    new Set(values).size !== values.length
  )
    throw new Error(`${option} must contain unique senpi,codex,claude names`);
  return values as DiscoveryClient[];
}

export function parseDiscoveryOptions(argv: readonly string[]): DiscoveryOptions {
  let resolved: DiscoveryClient[] = [];
  let executeContracts: DiscoveryClient[] = [];
  let structuralOnly: DiscoveryClient[] = [];
  let contractCommand = "";
  let version = 0;
  let sentinel = "";
  let out = "";
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = required(argv, index++);
    if (option === "--resolve-command") resolved = clients(value, option);
    else if (option === "--execute-contract") executeContracts = clients(value, option);
    else if (option === "--structural-only") structuralOnly = clients(value, option);
    else if (option === "--contract-command") contractCommand = value;
    else if (option === "--expect-contract-version") version = Number(value);
    else if (option === "--expect-sentinel") sentinel = value;
    else if (option === "--out") out = value;
    else throw new Error(`unknown option: ${option}`);
  }
  const routed = [...executeContracts, ...structuralOnly];
  if (
    resolved.length === 0 ||
    executeContracts.length === 0 ||
    structuralOnly.length === 0 ||
    contractCommand === "" ||
    version !== 1 ||
    sentinel === "" ||
    out === "" ||
    new Set(routed).size !== routed.length ||
    resolved.length !== routed.length ||
    resolved.some((client) => !routed.includes(client))
  )
    throw new Error(
      "resolved clients must be explicitly partitioned into execution and structural-only clients",
    );
  return {
    clients: resolved,
    executeContracts,
    structuralOnly,
    contractCommand,
    version,
    sentinel,
    out,
  };
}
