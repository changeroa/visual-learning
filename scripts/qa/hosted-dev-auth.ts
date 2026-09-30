// TEST-ONLY Access JWTs for a local `bun run dev:hosted` Worker (wrangler env.local).
//
//   bun scripts/qa/hosted-dev-auth.ts                              # prints shell exports
//   bun scripts/qa/hosted-dev-auth.ts --seed http://127.0.0.1:8787 # also publishes demo figures
//
// Tokens are signed with tests/fixtures/hosted/test-access-key.json, whose public half is
// env.local LOCAL_JWKS_JSON; production verifies the Cloudflare Access JWKS and rejects them.
// CF_AUTHORIZATION is a user JWT (the allowed email); VISUAL_ATLAS_DEV_JWT is a service JWT
// (common_name = env.local SERVICE_CLIENT_ID) for publish/delete. --seed only accepts localhost.
import type { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseSceneMarkdown } from "../../src/excalidraw-file";
import { seedSpecAndScene, seedVerifyRuns } from "../../tests/support/hosted-api-stub";

// Mirrors env.local vars in hosted/wrangler.jsonc.
const local = {
  teamDomain: "local-test.cloudflareaccess.com",
  aud: "local-test-aud",
  email: "owner@example.com",
  serviceClientId: "local-test-client.access",
};
const repoRoot = resolve(import.meta.dir, "../..");
const fixtures = join(repoRoot, "tests/fixtures/hosted");
const exportSeries = join(fixtures, "payload/export-series/docs/vl/projects/visual-learning");

const { values: args } = parseArgs({ options: { seed: { type: "string" } } });

const testKey = JSON.parse(readFileSync(join(fixtures, "test-access-key.json"), "utf8")) as {
  kid: string;
  privateJwk: webcrypto.JsonWebKey;
};
const signingKey = await crypto.subtle.importKey(
  "jwk",
  testKey.privateJwk,
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  false,
  ["sign"],
);

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function sign(claims: Record<string, unknown>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: `https://${local.teamDomain}`, aud: local.aud, iat: now, exp: now + 3600 };
  const input = `${encode({ alg: "RS256", kid: testKey.kid, typ: "JWT" })}.${encode({ ...body, ...claims })}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${Buffer.from(signature).toString("base64url")}`;
}

const userJwt = await sign({ email: local.email });
const serviceJwt = await sign({ common_name: local.serviceClientId });

if (args.seed !== undefined) {
  const base = new URL(args.seed);
  if (base.hostname !== "127.0.0.1" && base.hostname !== "localhost")
    throw new Error(`--seed only targets a local dev Worker, not ${base.hostname}`);
  const secondSpec = JSON.parse(
    readFileSync(join(exportSeries, "specs/vl-01-architecture.json"), "utf8"),
  ) as { source: { root: string } };
  // The Worker accepts only path-scrubbed specs (source.root is the repo name).
  secondSpec.source.root = "visual-learning";
  const second = {
    spec: secondSpec,
    scene: parseSceneMarkdown(
      readFileSync(join(exportSeries, "vl-01-architecture.excalidraw.md"), "utf8"),
    ).scene,
  };
  const figures = [seedSpecAndScene(), second].map(({ spec, scene }) => ({
    spec,
    scene,
    verify: seedVerifyRuns(spec),
  }));
  const response = await fetch(new URL("/api/publish", base), {
    method: "POST",
    headers: { "cf-access-jwt-assertion": serviceJwt, "content-type": "application/json" },
    body: JSON.stringify({
      projectId: "visual-learning",
      repoName: "visual-learning",
      commit: null,
      figures,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`seed publish failed: ${response.status} ${text}`);
  console.error(`seeded visual-learning: ${text}`);
}

console.log(`export CF_AUTHORIZATION=${userJwt}`);
console.log(`export VISUAL_ATLAS_DEV_JWT=${serviceJwt}`);
