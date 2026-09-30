import { beforeAll, describe, expect, test } from "bun:test";
import type { webcrypto } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AuthError,
  authenticate,
  createJwksProvider,
  type Env,
  type JwksProvider,
} from "../hosted/worker/access-auth";

const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;
const wranglerPath = join(import.meta.dir, "../hosted/wrangler.jsonc");

type JsonWebKey = webcrypto.JsonWebKey & { readonly kid?: string };

type TestKey = {
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly publicJwk: JsonWebKey;
};

let primaryKey: TestKey | undefined;
let forgedKey: TestKey | undefined;
let rotatedKey: TestKey | undefined;

async function generateTestKey(kid: string): Promise<TestKey> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    kid,
    privateKey: pair.privateKey,
    publicJwk: { ...exported, alg: "RS256", kid, use: "sig" },
  };
}

function getPrimaryKey(): TestKey {
  if (primaryKey === undefined) throw new TypeError("Primary test key was not generated");
  return primaryKey;
}

function getForgedKey(): TestKey {
  if (forgedKey === undefined) throw new TypeError("Forged test key was not generated");
  return forgedKey;
}

function getRotatedKey(): TestKey {
  if (rotatedKey === undefined) throw new TypeError("Rotated test key was not generated");
  return rotatedKey;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function signToken(
  signingKey: TestKey,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: signingKey.kid, typ: "JWT" },
): Promise<string> {
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

function userClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aud: ["another-audience", "atlas-audience"],
    iss: "https://team.cloudflareaccess.com",
    exp: NOW_SECONDS + 3600,
    nbf: NOW_SECONDS - 60,
    email: " owner@example.com ",
    ...overrides,
  };
}

function serviceClaims(commonName = "publish-client"): Record<string, unknown> {
  return {
    aud: "atlas-audience",
    iss: "https://team.cloudflareaccess.com",
    exp: NOW_SECONDS + 3600,
    nbf: NOW_SECONDS,
    common_name: commonName,
  };
}

function localEnv(keys: readonly JsonWebKey[]): Env {
  return {
    ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    ACCESS_AUD: "atlas-audience",
    ALLOWED_EMAIL: "owner@example.com",
    SERVICE_CLIENT_ID: "publish-client",
    ENVIRONMENT: "local",
    LOCAL_JWKS_JSON: JSON.stringify({ keys }),
  };
}

function productionEnv(): Env {
  return {
    ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    ACCESS_AUD: "atlas-audience",
    ALLOWED_EMAIL: "owner@example.com",
    SERVICE_CLIENT_ID: "publish-client",
  };
}

function localProvider(): JwksProvider {
  return createJwksProvider({
    now: () => NOW_MS,
    fetch: async () => {
      throw new TypeError("Local authentication must not fetch JWKS");
    },
  });
}

function requestWithHeader(token: string): Request {
  return new Request("https://atlas.example/api/me", {
    headers: { "Cf-Access-Jwt-Assertion": token },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripJsoncComments(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (character === undefined) break;
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === "/" && next === "/") {
      while (index < value.length && value[index] !== "\n") index += 1;
      result += "\n";
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (index < value.length && !(value[index] === "*" && value[index + 1] === "/")) {
        if (value[index] === "\n") result += "\n";
        index += 1;
      }
      index += 1;
      continue;
    }
    result += character;
  }
  return result;
}

function stripJsoncTrailingCommas(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined) break;
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(value[nextIndex] ?? "")) nextIndex += 1;
      if (value[nextIndex] === "}" || value[nextIndex] === "]") continue;
    }
    result += character;
  }
  return result;
}

function readTopLevelVars(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(stripJsoncTrailingCommas(stripJsoncComments(value)));
  if (!isRecord(parsed) || !isRecord(parsed["vars"])) throw new TypeError("Missing top-level vars");
  return parsed["vars"];
}

async function expectAuthError(promise: Promise<unknown>, status: 401 | 403): Promise<void> {
  try {
    await promise;
    throw new TypeError("Expected authentication to fail");
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    expect(error.status).toBe(status);
  }
}

beforeAll(async () => {
  [primaryKey, forgedKey, rotatedKey] = await Promise.all([
    generateTestKey("primary"),
    generateTestKey("forged"),
    generateTestKey("rotated"),
  ]);
});

describe("Cloudflare Access identities", () => {
  test("accepts the single allowed user case-insensitively after trimming", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, userClaims({ email: "  Owner@EXAMPLE.com  " }));

    await expect(
      authenticate(requestWithHeader(token), localEnv([primary.publicJwk]), localProvider()),
    ).resolves.toEqual({ kind: "user", email: "Owner@EXAMPLE.com" });
  });

  test("rejects a different user email with 403", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, userClaims({ email: "intruder@example.com" }));

    await expectAuthError(
      authenticate(requestWithHeader(token), localEnv([primary.publicJwk]), localProvider()),
      403,
    );
  });

  test("accepts a service token with no email and the configured common_name", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, serviceClaims());

    await expect(
      authenticate(requestWithHeader(token), localEnv([primary.publicJwk]), localProvider()),
    ).resolves.toEqual({ kind: "service", clientId: "publish-client" });
  });

  test("rejects a service token with the wrong common_name with 403", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, serviceClaims("other-client"));

    await expectAuthError(
      authenticate(requestWithHeader(token), localEnv([primary.publicJwk]), localProvider()),
      403,
    );
  });

  test("accepts CF_Authorization when the assertion header is absent", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, userClaims());
    const request = new Request("https://atlas.example/api/me", {
      headers: { Cookie: `other=value; CF_Authorization=${token}; final=value` },
    });

    await expect(
      authenticate(request, localEnv([primary.publicJwk]), localProvider()),
    ).resolves.toMatchObject({ kind: "user" });
  });

  test("does not trust the asserted-email header without a JWT", async () => {
    const request = new Request("https://atlas.example/api/me", {
      headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
    });

    await expectAuthError(authenticate(request, localEnv([]), localProvider()), 401);
  });

  test("fails closed when a required runtime binding is missing", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, {
      aud: "atlas-audience",
      iss: "https://team.cloudflareaccess.com",
      exp: NOW_SECONDS + 3600,
    });
    const incompleteEnv = {
      ...localEnv([primary.publicJwk]),
      SERVICE_CLIENT_ID: undefined,
    } as unknown as Env;

    await expectAuthError(
      authenticate(requestWithHeader(token), incompleteEnv, localProvider()),
      401,
    );
  });
});

describe("JWT claims and signature verification", () => {
  test("rejects the wrong audience with 401", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, userClaims({ aud: ["wrong-audience"] }));

    await expectAuthError(
      authenticate(requestWithHeader(token), localEnv([primary.publicJwk]), localProvider()),
      401,
    );
  });

  test("rejects the wrong issuer with 401", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, userClaims({ iss: "https://other.example" }));

    await expectAuthError(
      authenticate(requestWithHeader(token), localEnv([primary.publicJwk]), localProvider()),
      401,
    );
  });

  test("rejects a token expired beyond the 60 second skew with 401", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, userClaims({ exp: NOW_SECONDS - 61 }));

    await expectAuthError(
      authenticate(requestWithHeader(token), localEnv([primary.publicJwk]), localProvider()),
      401,
    );
  });

  test("rejects nbf more than 60 seconds in the future with 401", async () => {
    const primary = getPrimaryKey();
    const token = await signToken(primary, userClaims({ nbf: NOW_SECONDS + 61 }));

    await expectAuthError(
      authenticate(requestWithHeader(token), localEnv([primary.publicJwk]), localProvider()),
      401,
    );
  });

  test("forged keypair signature returns 401", async () => {
    const primary = getPrimaryKey();
    const forged = getForgedKey();
    const token = await signToken(forged, userClaims(), {
      alg: "RS256",
      kid: primary.kid,
      typ: "JWT",
    });

    await expectAuthError(
      authenticate(requestWithHeader(token), localEnv([primary.publicJwk]), localProvider()),
      401,
    );
  });

  test("rejects the none algorithm with 401", async () => {
    const token = `${encode({ alg: "none", kid: "primary" })}.${encode(userClaims())}.eA`;

    await expectAuthError(
      authenticate(
        requestWithHeader(token),
        localEnv([getPrimaryKey().publicJwk]),
        localProvider(),
      ),
      401,
    );
  });
});

describe("JWKS loading", () => {
  test("refetches exactly once for an unknown kid and uses the documented URL", async () => {
    const primary = getPrimaryKey();
    const rotated = getRotatedKey();
    const urls: string[] = [];
    let fetchCount = 0;
    const provider = createJwksProvider({
      now: () => NOW_MS,
      fetch: async (input) => {
        urls.push(String(input));
        fetchCount += 1;
        const keys = fetchCount === 1 ? [primary.publicJwk] : [rotated.publicJwk];
        return new Response(JSON.stringify({ keys }));
      },
    });
    const token = await signToken(rotated, userClaims());

    await expect(
      authenticate(requestWithHeader(token), productionEnv(), provider),
    ).resolves.toMatchObject({ kind: "user" });
    expect(fetchCount).toBe(2);
    expect(urls).toEqual([
      "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
      "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
    ]);
  });

  test("caches JWKS for ten minutes and refreshes at expiry", async () => {
    const primary = getPrimaryKey();
    const rotated = getRotatedKey();
    let nowMs = NOW_MS;
    let fetchCount = 0;
    const provider = createJwksProvider({
      now: () => nowMs,
      fetch: async () => {
        fetchCount += 1;
        const keys = fetchCount === 1 ? [primary.publicJwk] : [rotated.publicJwk];
        return new Response(JSON.stringify({ keys }));
      },
    });
    const firstToken = await signToken(primary, userClaims());

    await authenticate(requestWithHeader(firstToken), productionEnv(), provider);
    nowMs += 10 * 60 * 1000 - 1;
    await authenticate(requestWithHeader(firstToken), productionEnv(), provider);
    expect(fetchCount).toBe(1);

    nowMs += 1;
    const rotatedToken = await signToken(rotated, userClaims());
    await authenticate(requestWithHeader(rotatedToken), productionEnv(), provider);
    expect(fetchCount).toBe(2);
  });
});

describe("malformed and missing tokens", () => {
  test("rejects a missing token with 401", async () => {
    await expectAuthError(
      authenticate(
        new Request("https://atlas.example/api/me"),
        localEnv([getPrimaryKey().publicJwk]),
        localProvider(),
      ),
      401,
    );
  });

  const malformed = [
    ["two JWT parts", "abc.def"],
    ["invalid base64url", "%%%.abc.def"],
    ["a 64KB assertion header", "x".repeat(64 * 1024)],
  ] as const;

  for (const [name, token] of malformed) {
    test(`rejects ${name} with 401 without crashing`, async () => {
      await expectAuthError(
        authenticate(
          requestWithHeader(token),
          localEnv([getPrimaryKey().publicJwk]),
          localProvider(),
        ),
        401,
      );
    });
  }
});

test.skipIf(!existsSync(wranglerPath))(
  "production wrangler top-level vars omit ENVIRONMENT",
  () => {
    const wrangler = readFileSync(wranglerPath, "utf8");
    expect(Object.hasOwn(readTopLevelVars(wrangler), "ENVIRONMENT")).toBe(false);
  },
);
