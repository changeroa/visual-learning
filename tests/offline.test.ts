import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertNoPlaintext,
  buildRegistryJson,
  chainFromSnapshot,
  classifyNetworkDenial,
  DENY_NETWORK_PROFILE,
  descentProven,
  OFFLINE_CLI_STUB,
  parsePsSnapshot,
  scanRootsForPlaintext,
  sentinelRecord,
  treeDigest,
  validateProfileContent,
  validateStubScript,
} from "../scripts/qa/offline-support";

const profilePath = join(import.meta.dir, "fixtures/deny-network.sb");
const stubPath = join(import.meta.dir, "fixtures/offline-obsidian-cli");

describe("offline sandbox profile", () => {
  test("deny-network.sb holds exactly the required deny-network profile", () => {
    // Given / When
    const content = readFileSync(profilePath, "utf8");
    // Then
    expect(content).toBe(DENY_NETWORK_PROFILE);
    expect(validateProfileContent(content)).toEqual({ valid: true });
  });

  test("validateProfileContent rejects tampered profiles", () => {
    expect(validateProfileContent("(version 1) (allow default)\n")).toMatchObject({ valid: false });
    expect(
      validateProfileContent("(version 1) (allow default) (deny network*) (allow network*)\n"),
    ).toMatchObject({ valid: false });
  });
});

describe("offline Obsidian CLI stub", () => {
  test("fixture is the exact filesystem-only stub and is executable", async () => {
    // Given / When
    const content = readFileSync(stubPath, "utf8");
    const mode = await Bun.file(stubPath)
      .stat()
      .then((status) => status.mode);
    // Then
    expect(content).toBe(OFFLINE_CLI_STUB);
    expect(validateStubScript(content)).toEqual({ valid: true });
    expect(mode & 0o111).not.toBe(0);
  });

  test("validateStubScript rejects incomplete or network-capable stubs", () => {
    expect(validateStubScript("#!/bin/sh\nexit 0\n")).toMatchObject({ valid: false });
    expect(validateStubScript("#!/bin/sh\n/usr/bin/curl https://example.invalid\n")).toMatchObject({
      valid: false,
    });
  });
});

describe("network denial classifier", () => {
  test("classifies the real sandbox denial captures", () => {
    // Captured on this workstation from (deny network*) containment.
    expect(
      classifyNetworkDenial({
        tool: "/usr/bin/python3",
        exitCode: 1,
        stderr: "Err PermissionError 1 [Errno 1] Operation not permitted",
      }),
    ).toBe("denied-operation-not-permitted");
    expect(
      classifyNetworkDenial({
        tool: "/usr/bin/curl",
        exitCode: 7,
        stderr:
          "curl: (7) Failed to connect to 127.0.0.1 port 45932 after 0 ms: Couldn't connect to server",
      }),
    ).toBe("denied");
    expect(
      classifyNetworkDenial({
        tool: "/usr/bin/curl",
        exitCode: 6,
        stderr: "curl: (6) Could not resolve host: example.invalid",
      }),
    ).toBe("denied");
  });

  test("successful or unrelated failures are not denials", () => {
    expect(classifyNetworkDenial({ tool: "/usr/bin/curl", exitCode: 0, stderr: "" })).toBe(
      "not-denied",
    );
    expect(
      classifyNetworkDenial({
        tool: "/usr/bin/curl",
        exitCode: 26,
        stderr: "curl: (26) read error",
      }),
    ).toBe("not-denied");
  });
});

describe("sandbox home registry", () => {
  test("registry maps the verified vault id to the sandbox vault path", () => {
    // Given / When
    const registry = JSON.parse(buildRegistryJson("offline-fixture", "/tmp/offline-vault"));
    // Then
    expect(registry).toEqual({ vaults: { "offline-fixture": { path: "/tmp/offline-vault" } } });
  });
});

describe("sentinel hash-only recording", () => {
  test("records only SHA-256 and length, never the plaintext", () => {
    // Given
    const plaintext = randomBytes(32);
    // When
    const record = sentinelRecord(plaintext);
    // Then
    expect(record).toEqual({
      algorithm: "SHA-256",
      byteLength: 32,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      plaintextRetained: false,
    });
    const serialized = JSON.stringify(record);
    const hex = plaintext.toString("hex");
    expect(serialized.includes(hex)).toBe(false);
    expect(() => assertNoPlaintext(serialized, hex)).not.toThrow();
    expect(() => assertNoPlaintext(`{"leak":"${hex}"}`, hex)).toThrow(/plaintext sentinel leaked/);
  });
});

describe("sentinel plaintext scan", () => {
  test("finds plaintext only where it exists and skips symlinks", () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "offline-scan-"));
    const nested = join(root, "nested");
    mkdirSync(nested);
    const plaintext = randomBytes(32).toString("hex");
    const designated = join(root, "private-sentinel.txt");
    const decoy = join(nested, "decoy.log");
    const clean = join(root, "clean.json");
    writeFileSync(designated, `${plaintext}\n`);
    writeFileSync(decoy, `prefix ${plaintext} suffix\n`);
    writeFileSync(clean, '{"clean":true}\n');
    symlinkSync(clean, join(root, "clean-link"));
    // When
    const report = scanRootsForPlaintext([root], Buffer.from(plaintext, "utf8"), designated, {
      maxFileBytes: 1024 * 1024,
    });
    // Then
    expect(report.roots).toHaveLength(1);
    const scanned = report.roots[0];
    if (scanned === undefined) throw new TypeError("unreachable");
    expect(scanned.filesScanned).toBe(3);
    expect(scanned.symlinksSkipped).toBe(1);
    expect(scanned.matches.map((match) => match.path).sort()).toEqual([designated, decoy].sort());
    expect(scanned.matches.find((match) => match.path === designated)?.count).toBe(1);
    expect(scanned.matches.find((match) => match.path === decoy)?.count).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("sandbox descent proof", () => {
  test("parses ps output and proves the wrapper chain", () => {
    // Given
    const snapshotText = [
      "   100      1   Mon Aug 18 12:00:00 2026  /sbin/launchd",
      "   200    100   Mon Aug 18 12:00:01 2026  bun scripts/qa/offline.ts --out receipt.json",
      "   300    200   Mon Aug 18 12:00:02 2026  /usr/bin/sandbox-exec -f deny-network.sb bun bin/visual-note open",
      "   301    300   Mon Aug 18 12:00:02 2026  /bin/sh stub",
    ].join("\n");
    // When
    const snapshot = parsePsSnapshot(snapshotText);
    const chain = chainFromSnapshot(snapshot, 301);
    // Then
    expect(snapshot.length).toBe(4);
    expect(chain.map((entry) => entry.pid)).toEqual([301, 300, 200, 100]);
    expect(descentProven(chain, 300, 200)).toBe(true);
    expect(descentProven(chain, 999, 200)).toBe(false);
  });
});

describe("vault tree digest", () => {
  test("digest is stable until content changes", () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "offline-digest-"));
    writeFileSync(join(root, "a.txt"), "alpha\n");
    // When
    const first = treeDigest(root);
    const second = treeDigest(root);
    writeFileSync(join(root, "a.txt"), "beta\n");
    const third = treeDigest(root);
    // Then
    expect(first.digest).toBe(second.digest);
    expect(first.digest).not.toBe(third.digest);
    rmSync(root, { recursive: true, force: true });
  });
});
