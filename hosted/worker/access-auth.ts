import type { webcrypto } from "node:crypto";

const JWKS_CACHE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_LENGTH = 16 * 1024;

type JsonWebKey = webcrypto.JsonWebKey & { readonly kid?: string };
type FetchJwks = (input: string) => Promise<Response>;

export interface Env {
  readonly ACCESS_TEAM_DOMAIN: string;
  readonly ACCESS_AUD: string;
  readonly ALLOWED_EMAIL: string;
  readonly SERVICE_CLIENT_ID: string;
  readonly ENVIRONMENT?: string;
  readonly LOCAL_JWKS_JSON?: string;
}

export type AccessIdentity =
  | { readonly kind: "user"; readonly email: string }
  | { readonly kind: "service"; readonly clientId: string };

export interface JwksProvider {
  getKey(kid: string, env: Env): Promise<JsonWebKey | undefined>;
  now(): number;
}

export interface JwksProviderOptions {
  readonly fetch?: FetchJwks;
  readonly now?: () => number;
}

export class AuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? "Unauthorized" : "Forbidden");
    this.name = "AuthError";
    this.status = status;
  }
}

type JwksDocument = {
  readonly keys: readonly JsonWebKey[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRsaJwk(value: unknown): value is JsonWebKey & { readonly kid: string } {
  return (
    isRecord(value) &&
    value["kty"] === "RSA" &&
    typeof value["kid"] === "string" &&
    value["kid"].length > 0
  );
}

function parseJwks(value: string): JwksDocument {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || !Array.isArray(parsed["keys"]) || !parsed["keys"].every(isRsaJwk)) {
    throw new TypeError("Invalid JWKS");
  }
  return { keys: parsed["keys"] };
}

function findKey(keys: readonly JsonWebKey[], kid: string): JsonWebKey | undefined {
  return keys.find((key) => key.kid === kid);
}

export function createJwksProvider(options: JwksProviderOptions = {}): JwksProvider {
  const fetchJwks = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<
    string,
    { readonly expiresAt: number; readonly keys: readonly JsonWebKey[] }
  >();

  async function load(url: string, force: boolean): Promise<readonly JsonWebKey[]> {
    const cached = cache.get(url);
    if (!force && cached !== undefined && now() < cached.expiresAt) return cached.keys;

    const response = await fetchJwks(url);
    if (!response.ok) throw new TypeError("JWKS request failed");
    const document = parseJwks(await response.text());
    cache.set(url, { expiresAt: now() + JWKS_CACHE_MS, keys: document.keys });
    return document.keys;
  }

  return {
    async getKey(kid, env) {
      if (env.ENVIRONMENT === "local") {
        if (env.LOCAL_JWKS_JSON === undefined) throw new TypeError("Missing local JWKS");
        return findKey(parseJwks(env.LOCAL_JWKS_JSON).keys, kid);
      }

      const url = `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
      const cachedOrFetched = await load(url, false);
      const firstMatch = findKey(cachedOrFetched, kid);
      if (firstMatch !== undefined) return firstMatch;
      return findKey(await load(url, true), kid);
    },
    now,
  };
}

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("Cookie");
  if (cookie === null) return undefined;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

function readToken(request: Request): string {
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ?? readCookie(request, "CF_Authorization");
  if (token === undefined || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new AuthError(401);
  }
  return token;
}

function decodeBase64Url(segment: string): Uint8Array<ArrayBuffer> {
  if (segment.length === 0 || !/^[A-Za-z0-9_-]+$/.test(segment)) throw new AuthError(401);
  const paddingLength = (4 - (segment.length % 4)) % 4;
  const encoded = segment.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(paddingLength);
  const decoded = atob(encoded);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function parseSegment(segment: string): Record<string, unknown> {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(segment));
  const parsed: unknown = JSON.parse(decoded);
  if (!isRecord(parsed)) throw new AuthError(401);
  return parsed;
}

function parseToken(token: string): {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  readonly signature: Uint8Array<ArrayBuffer>;
  readonly signingInput: Uint8Array<ArrayBuffer>;
} {
  const segments = token.split(".");
  if (segments.length !== 3) throw new AuthError(401);
  const headerSegment = segments[0];
  const payloadSegment = segments[1];
  const signatureSegment = segments[2];
  if (
    headerSegment === undefined ||
    payloadSegment === undefined ||
    signatureSegment === undefined
  ) {
    throw new AuthError(401);
  }
  return {
    header: parseSegment(headerSegment),
    payload: parseSegment(payloadSegment),
    signature: decodeBase64Url(signatureSegment),
    signingInput: new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
  };
}

function hasExpectedAudience(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value === expected;
  return (
    Array.isArray(value) &&
    value.every((audience): audience is string => typeof audience === "string") &&
    value.includes(expected)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasRequiredConfiguration(env: Env): boolean {
  const values: readonly unknown[] = [
    env.ACCESS_TEAM_DOMAIN,
    env.ACCESS_AUD,
    env.ALLOWED_EMAIL,
    env.SERVICE_CLIENT_ID,
  ];
  return values.every((value) => typeof value === "string" && value.trim().length > 0);
}

async function verifyToken(token: string, env: Env, jwks: JwksProvider): Promise<AccessIdentity> {
  if (!hasRequiredConfiguration(env)) throw new AuthError(401);
  const parsed = parseToken(token);
  if (parsed.header["alg"] !== "RS256") throw new AuthError(401);
  const kid = parsed.header["kid"];
  if (typeof kid !== "string" || kid.length === 0) throw new AuthError(401);

  const jwk = await jwks.getKey(kid, env);
  if (jwk === undefined || jwk.kty !== "RSA" || (jwk.alg !== undefined && jwk.alg !== "RS256")) {
    throw new AuthError(401);
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    parsed.signature,
    parsed.signingInput,
  );
  if (!validSignature) throw new AuthError(401);

  const nowSeconds = jwks.now() / 1000;
  const expiresAt = parsed.payload["exp"];
  const notBefore = parsed.payload["nbf"];
  if (
    parsed.payload["iss"] !== `https://${env.ACCESS_TEAM_DOMAIN}` ||
    !hasExpectedAudience(parsed.payload["aud"], env.ACCESS_AUD) ||
    !isFiniteNumber(expiresAt) ||
    nowSeconds > expiresAt + CLOCK_SKEW_SECONDS ||
    (notBefore !== undefined &&
      (!isFiniteNumber(notBefore) || nowSeconds + CLOCK_SKEW_SECONDS < notBefore))
  ) {
    throw new AuthError(401);
  }

  if (Object.hasOwn(parsed.payload, "email")) {
    const email = parsed.payload["email"];
    if (
      typeof email !== "string" ||
      email.trim().toLowerCase() !== env.ALLOWED_EMAIL.trim().toLowerCase()
    ) {
      throw new AuthError(403);
    }
    return { kind: "user", email: email.trim() };
  }

  if (parsed.payload["common_name"] !== env.SERVICE_CLIENT_ID) throw new AuthError(403);
  return { kind: "service", clientId: env.SERVICE_CLIENT_ID };
}

export async function authenticate(
  request: Request,
  env: Env,
  jwks: JwksProvider,
): Promise<AccessIdentity> {
  try {
    return await verifyToken(readToken(request), env, jwks);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401);
  }
}
