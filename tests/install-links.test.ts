import { afterEach, describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const installer = join(import.meta.dir, "../scripts/install-links.ts");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; home: string; canonical: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "visual-links-")));
  roots.push(root);
  const home = join(root, "home");
  const canonical = join(root, "canonical", "visual-learning");
  mkdirSync(canonical, { recursive: true });
  writeFileSync(join(canonical, "SKILL.md"), "canonical\n");
  for (const parent of [".senpi/agent/skills", ".codex/skills", ".claude/skills"])
    mkdirSync(join(home, parent), { recursive: true });
  return { root, home, canonical };
}

async function install(home: string, canonical: string, extra: string[] = []) {
  return Bun.$`bun ${installer} --home ${home} --canonical ${canonical} ${extra}`.quiet().nothrow();
}

async function waitLine(stream: ReadableStream<Uint8Array>, expected: string): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let value = "";
  while (true) {
    const next = await reader.read();
    if (next.done) throw new Error(`process ended before ${expected}: ${value}`);
    value += decoder.decode(next.value, { stream: true });
    if (value.includes(`${expected}\n`)) return;
  }
}

describe("install-links", () => {
  test("creates one canonical symlink per client and is idempotent", async () => {
    const { home, canonical } = fixture();
    const first = await install(home, canonical);
    expect(first.exitCode).toBe(0);
    const second = await install(home, canonical);
    expect(second.exitCode).toBe(0);
    for (const relative of [
      ".senpi/agent/skills/visual-learning",
      ".codex/skills/visual-learning",
      ".claude/skills/visual-learning",
    ]) {
      const link = join(home, relative);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(realpathSync(link)).toBe(realpathSync(canonical));
    }
    expect(
      JSON.parse(second.stdout.toString()).links.every(
        (entry: { status: string }) => entry.status === "existing",
      ),
    ).toBe(true);
  });

  test("refuses a non-symlink collision without changing inode or content", async () => {
    const { home, canonical } = fixture();
    const collision = join(home, ".codex/skills/visual-learning");
    writeFileSync(collision, "keep me");
    const before = lstatSync(collision);
    const result = await install(home, canonical, ["--clients", "codex"]);
    const after = lstatSync(collision);
    expect(result.exitCode).toBe(2);
    expect([after.dev, after.ino, readFileSync(collision, "utf8")]).toEqual([
      before.dev,
      before.ino,
      "keep me",
    ]);
  });

  test("refuses a wrong-target symlink without replacing it", async () => {
    const { root, home, canonical } = fixture();
    const wrong = join(root, "wrong");
    mkdirSync(wrong);
    const collision = join(home, ".claude/skills/visual-learning");
    symlinkSync(wrong, collision);
    const before = lstatSync(collision);
    const result = await install(home, canonical, ["--clients", "claude"]);
    expect(result.exitCode).toBe(2);
    expect([lstatSync(collision).ino, readlinkSync(collision)]).toEqual([before.ino, wrong]);
  });

  test("refuses an ancestor swap after retaining the parent descriptor", async () => {
    const { root, home, canonical } = fixture();
    const attacker = join(root, "attacker");
    mkdirSync(join(attacker, "skills"), { recursive: true });
    const child = Bun.spawn(
      [
        "bun",
        installer,
        "--home",
        home,
        "--canonical",
        canonical,
        "--clients",
        "claude",
        "--hold-after-parent",
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    await waitLine(child.stdout, "PARENT_READY");
    renameSync(join(home, ".claude"), join(home, ".claude-retained"));
    symlinkSync(attacker, join(home, ".claude"));
    child.stdin.write("CONTINUE\n");
    child.stdin.end();
    expect(await child.exited).toBe(2);
    expect(() => lstatSync(join(attacker, "skills/visual-learning"))).toThrow();
    expect(() => lstatSync(join(home, ".claude-retained/skills/visual-learning"))).toThrow();
  });

  test("refuses a final-component swap after its absence check", async () => {
    const { root, home, canonical } = fixture();
    const wrong = join(root, "wrong");
    mkdirSync(wrong);
    const final = join(home, ".codex/skills/visual-learning");
    const child = Bun.spawn(
      [
        "bun",
        installer,
        "--home",
        home,
        "--canonical",
        canonical,
        "--clients",
        "codex",
        "--hold-after-check",
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    await waitLine(child.stdout, "CHECK_READY");
    symlinkSync(wrong, final);
    const before = lstatSync(final);
    child.stdin.write("CONTINUE\n");
    child.stdin.end();
    expect(await child.exited).toBe(2);
    expect([lstatSync(final).ino, readlinkSync(final)]).toEqual([before.ino, wrong]);
  });

  test("refuses a canonical target pathname swap before creation", async () => {
    const { root, home, canonical } = fixture();
    const attacker = join(root, "attacker-canonical");
    mkdirSync(attacker);
    const child = Bun.spawn(
      [
        "bun",
        installer,
        "--home",
        home,
        "--canonical",
        canonical,
        "--clients",
        "senpi",
        "--hold-after-check",
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    await waitLine(child.stdout, "CHECK_READY");
    renameSync(canonical, `${canonical}-retained`);
    symlinkSync(attacker, canonical);
    child.stdin.write("CONTINUE\n");
    child.stdin.end();
    expect(await child.exited).toBe(2);
    expect(() => lstatSync(join(home, ".senpi/agent/skills/visual-learning"))).toThrow();
  });

  test("refuses a missing discovery parent instead of creating it", async () => {
    const { home, canonical } = fixture();
    rmSync(join(home, ".codex"), { recursive: true });
    const result = await install(home, canonical, ["--clients", "codex"]);
    expect(result.exitCode).toBe(2);
    expect(() => lstatSync(join(home, ".codex"))).toThrow();
  });

  test("refuses non-normalized roots before invoking the descriptor helper", async () => {
    const { home, canonical } = fixture();
    const result = await install(`${home}/../home`, canonical, ["--clients", "claude"]);
    expect(result.exitCode).toBe(2);
    expect(() => lstatSync(join(home, ".claude/skills/visual-learning"))).toThrow();
  });

  test("concurrent installers converge on the same target without replacement", async () => {
    const { home, canonical } = fixture();
    const [left, right] = await Promise.all([
      install(home, canonical, ["--clients", "senpi"]),
      install(home, canonical, ["--clients", "senpi"]),
    ]);
    expect([left.exitCode, right.exitCode]).toEqual([0, 0]);
    expect(realpathSync(join(home, ".senpi/agent/skills/visual-learning"))).toBe(canonical);
  });
});
