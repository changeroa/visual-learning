import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { InputError } from "../src/errors";
import { parseVisualNoteSpec, type VisualNoteSpec } from "../src/schema";
import { recordVerify } from "../src/verify-record";

type VerifyStep = {
  readonly semanticId: string;
  readonly how: string;
  readonly command?: string;
};

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function run(args: readonly string[]): string {
  const result = Bun.spawnSync([...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString());
  }
  return result.stdout.toString();
}

function repository(): { readonly root: string; readonly commit: string } {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "visual-note-verify-record-")));
  roots.push(workspace);
  const root = join(workspace, "repo");
  mkdirSync(join(root, "src"), { recursive: true });
  run(["git", "init", "-q", root]);
  writeFileSync(join(root, "README.md"), "fixture | & ; < > $ ` ( ) *\nabcdefghijklmno\n");
  writeFileSync(join(root, "src/file"), "pattern\n");
  writeFileSync(join(root, "file"), "one\ntwo\nthree\nfour\nfive\nsix\n");
  run(["git", "-C", root, "add", "README.md", "src/file", "file"]);
  run([
    "git",
    "-C",
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  ]);
  return { root, commit: run(["git", "-C", root, "rev-parse", "HEAD"]).trim() };
}

function createOutsideFile(root: string): string {
  const outside = join(root, "..", "outside");
  mkdirSync(outside, { recursive: true });
  const file = join(outside, "secret.txt");
  writeFileSync(file, "outside secret\n");
  return file;
}

function spec(verify: readonly VerifyStep[]): VisualNoteSpec {
  return parseVisualNoteSpec({
    schemaVersion: 1,
    artifactId: "verify-record",
    kind: "code-exploration",
    revision: 1,
    title: "Verify recorder",
    source: { root: "/tmp/source", commit: null },
    learning: {
      question: "How is the recorder checked?",
      answer: "By running allowlisted commands without a shell.",
      verify,
    },
    nodes: [
      {
        semanticId: "recorder",
        label: "recordVerify",
        status: "fact",
        evidence: [{ path: "src/verify-record.ts" }],
      },
    ],
    edges: [],
  });
}

describe("allowlisted local verify recorder", () => {
  test.each([
    'git grep "-Otouch side-effect;" pattern',
    'git grep "--open-files=touch side-effect;" pattern',
    "grep -rS 'outside secret' .",
  ])("blocks independently reproduced escape: %s", async (command) => {
    const { root } = repository();
    symlinkSync(join(createOutsideFile(root), ".."), join(root, "outside-link"));
    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject reproduced escape", command }]),
      root,
    );
    expect({
      markerCreated: existsSync(join(root, "side-effect")),
      secretPrinted: records.some((record) =>
        `${record.stdout}${record.stderr}`.includes("outside secret"),
      ),
      status: records[0]?.status,
      reason: records[0]?.reason,
    }).toEqual({
      markerCreated: false,
      secretPrinted: false,
      status: "not-run",
      reason: "option not allowlisted",
    });
  });

  test("runs an allowlisted command in the repository and records its revision", async () => {
    const { root, commit } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "read HEAD", command: "git rev-parse HEAD" }]),
      root,
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      index: 0,
      semanticId: "recorder",
      how: "read HEAD",
      command: "git rev-parse HEAD",
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: `${commit}\n`,
      stderr: "",
      commit,
    });
    expect(Number.isNaN(Date.parse(records[0]?.ranAt ?? ""))).toBe(false);
  });

  test.each([
    ["shell syntax", "cat README.md | wc", "shell syntax"],
    ["unterminated quote", 'cat "README.md', "unparseable"],
    ["unlisted executable", "rm -rf probe", "not allowlisted"],
  ] as const)("rejects %s without spawning", async (_label, command, reason) => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject unsafe input", command }]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "not-run",
      reason,
      exitCode: null,
      stdout: "",
      stderr: "",
    });
  });

  test("records a missing command without running anything", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "inspect the source directly" }]),
      root,
    );

    expect(records[0]).toMatchObject({
      command: null,
      status: "not-run",
      reason: "no command",
      exitCode: null,
      stdout: "",
      stderr: "",
    });
  });

  test("passes quoted metacharacters literally instead of interpreting them as shell syntax", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "find the literal text",
          command: "grep -F '| & ; < > $ ` ( ) *' README.md",
        },
      ]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "fixture | & ; < > $ ` ( ) *\n",
      stderr: "",
    });
  });

  test.each([
    ["git configuration injection", "git -c alias.show=status show"],
    ["sed without print-only mode", "sed -e 1p README.md"],
    ["rg pattern file option", "rg --file=patterns.txt pattern src"],
    ["recursive grep symlink traversal", "grep -R secret ."],
    ["rg symlink traversal", "rg --follow secret ."],
    ["wc input file list", "wc --files0-from=../outside/list"],
    ["ls symlink dereference", "ls -LR ."],
    ["git repository redirect", "git show --git-dir=outside HEAD"],
    ["git exclude file", "git ls-files --exclude-from=../outside/patterns"],
  ] as const)("rejects %s", async (_label, command) => {
    const { root } = repository();
    createOutsideFile(root);

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject unsafe options", command }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "option not allowlisted" });
    expect(existsSync(join(root, "side-effect"))).toBe(false);
    expect(JSON.stringify(records.map(({ stdout, stderr }) => ({ stdout, stderr })))).not.toContain(
      "outside secret",
    );
  });

  test.each([
    'git grep -O "touch side-effect;" pattern',
    'git grep "--open-files-in-pager=touch side-effect;" pattern',
    'git grep "--open=touch side-effect;" pattern',
    'git grep "-nOtouch side-effect;" pattern',
    'git grep --open-files-in-pager "touch side-effect;" pattern',
    "grep -Sr secret .",
    "grep -r secret .",
    "grep -S secret .",
    "grep -O secret .",
    "grep -p secret .",
    "grep --recursive secret .",
    "grep --file=../outside/secret.txt pattern",
    "rg --pre='touch side-effect' pattern .",
    "rg --pre-glob='*' pattern .",
    "rg -z pattern .",
    "rg -nz pattern .",
    "rg --search-zip pattern .",
    "rg -L secret .",
    "rg -nL secret .",
    "rg --follow secret .",
    "rg --smart-c pattern .",
    "rg --hid pattern .",
    "rg --count=true pattern .",
    "rg -f../outside/secret.txt pattern",
    "rg --ignore-file=../outside/secret.txt pattern",
    "cat -n README.md",
    "cat --help",
    "head -c 3 file",
    "head -n",
    "head -n -1 file",
    "head -n3x file",
    "tail -f file",
    "tail -F file",
    "wc --bytes file",
    "wc -m file",
    "ls -R .",
    "ls -L .",
    "sed -n '1W side-effect' README.md",
    "sed -n '1e touch side-effect' README.md",
    "sed -n '1p;w side-effect' README.md",
    "sed -n '$p' README.md",
    "sed -ni '1p' README.md",
    "sed -i -n '1p' README.md",
    "git --exec-path=outside show",
    "git -c core.pager='touch side-effect' show",
    "git show -c core.pager='touch side-effect'",
    "git show --output=side-effect",
    "git log --output side-effect",
    "git log --outp=side-effect",
    "git diff --outpu=side-effect",
    "git diff --ext-diff",
    "git show --ext-d",
    "git show --textconv HEAD:src/file",
    "git blame --textconv -- file",
    "git grep --textconv pattern",
    "git show --format='%(touch side-effect)'",
    "git log --format='%(describe)'",
    "git log --format=%G?",
    "git show --format=%GG",
    "git log --form=%s",
    "git log --format %s",
    "git log --stat=true",
    "git ls-files --stage",
    "git rev-parse --git-dir",
    "git rev-parse --short=8 HEAD",
    "git blame -L '/pattern/,+1' -- file",
    "git blame --contents=../outside/secret.txt -- file",
    "git diff --no-index README.md ../outside/secret.txt",
    "git grep -A3 pattern",
    "git grep --count pattern",
  ])("rejects non-allowlisted option or invalid value: %s", async (command) => {
    const { root } = repository();
    symlinkSync(join(createOutsideFile(root), ".."), join(root, "outside-link"));
    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject unsafe options", command }]),
      root,
    );
    expect(records[0]).toMatchObject({
      status: "not-run",
      reason: "option not allowlisted",
      exitCode: null,
      stdout: "",
      stderr: "",
    });
    expect(existsSync(join(root, "side-effect"))).toBe(false);
    expect(`${records[0]?.stdout}${records[0]?.stderr}`).not.toContain("outside secret");
  });

  test.each([
    "grep -esecret ../outside/secret.txt",
    "grep -ne secret -- ../outside/secret.txt",
    "rg -nA3 -e secret ../outside/secret.txt",
    "rg --glob='*' -e secret outside-link",
    "rg -t txt -e secret ../outside",
    "git grep -ne secret -- ../outside/secret.txt",
    "git show HEAD:../outside/secret.txt",
    "git show HEAD:outside-link",
    "git log -n3 -- ../outside",
    "git diff HEAD..HEAD -- outside-link",
    "git blame -L1,2 -- ../outside/secret.txt",
    "git ls-files -- ../outside",
    "cat -- outside-link",
    "head -n3 outside-link",
    "tail -n 3 ../outside/secret.txt",
    "wc -lc -- ../outside/secret.txt",
    "ls -la outside-link",
    "sed -n '1,2p' outside-link",
  ])("confines paths after parsed option values: %s", async (command) => {
    const { root } = repository();
    symlinkSync(createOutsideFile(root), join(root, "outside-link"));
    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "confine all path operands", command }]),
      root,
    );
    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
    expect(existsSync(join(root, "side-effect"))).toBe(false);
    expect(`${records[0]?.stdout}${records[0]?.stderr}`).not.toContain("outside secret");
  });

  test.each([
    ["rg -niSFwl pattern src", "src/file"],
    ["rg -c --count --smart-case pattern src", "src/file:1"],
    ["rg -e pattern -g '*' --glob='*' -t md --type=md -efixture .", "fixture"],
    ["rg -nA3 -B 1 -C2 --no-heading --hidden pattern src", "1:pattern"],
    ["grep -niFEwhH -A3 -B 1 -C2 pattern src/file", "pattern"],
    ["grep -lc -epattern src/file", "src/file"],
    ["grep -ne pattern src/file", "1:pattern"],
    ["cat -- file", "one"],
    ["head -n3 file", "three"],
    ["tail -n 2 file", "five"],
    ["wc -lwc file", "6"],
    ["ls -la1 src", "file"],
    ["sed -n '1,2p' file", "one\ntwo"],
    ["git show --stat --name-only --format=%s HEAD", "fixture"],
    ["git show HEAD:src/file", "pattern"],
    ["git log -n1 --oneline --stat --format=%s -- src/file", "fixture"],
    ["git ls-files -- src", "src/file"],
    ["git rev-parse --verify --short HEAD", ""],
    ["git blame -L1,2 -- file", "one"],
    ["git diff --stat --name-only HEAD..HEAD -- src/file", ""],
    ["git grep -niFwl -e pattern -- src", "src/file"],
    ["git grep -c pattern -- src", "src/file:1"],
  ])("runs allowlisted syntax: %s", async (command, output) => {
    const { root } = repository();
    symlinkSync(createOutsideFile(root), join(root, "outside-link"));
    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "exercise allowed syntax", command }]),
      root,
    );
    expect(records[0]).toMatchObject({ status: "ran", reason: null, exitCode: 0, stderr: "" });
    expect(records[0]?.stdout).toContain(output);
    expect(existsSync(join(root, "side-effect"))).toBe(false);
    expect(`${records[0]?.stdout}${records[0]?.stderr}`).not.toContain("outside secret");
  });

  test("does not follow symlinks in an allowed recursive rg search", async () => {
    const { root } = repository();
    symlinkSync(join(createOutsideFile(root), ".."), join(root, "outside-link"));
    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "search without following", command: "rg secret ." }]),
      root,
    );
    expect(records[0]).toMatchObject({ status: "ran", exitCode: 1, stdout: "", stderr: "" });
    expect(existsSync(join(root, "side-effect"))).toBe(false);
    expect(`${records[0]?.stdout}${records[0]?.stderr}`).not.toContain("outside secret");
  });

  test("neutralizes repository-local Git helpers for all allowed subcommands", async () => {
    const { root, commit } = repository();
    const outside = createOutsideFile(root);
    const helper = `touch '${join(root, "side-effect")}'; cat '${outside}';`;
    for (const key of ["core.pager", "diff.external", "diff.probe.textconv", "core.fsmonitor"]) {
      run(["git", "-C", root, "config", key, helper]);
    }
    run(["git", "-C", root, "config", "core.hooksPath", join(root, "hooks")]);
    mkdirSync(join(root, "hooks"));
    writeFileSync(join(root, "hooks/post-index-change"), `#!/bin/sh\n${helper}\n`, { mode: 0o755 });
    writeFileSync(join(root, ".gitattributes"), "* diff=probe\n");
    writeFileSync(join(root, "file"), "changed\n");
    const commands = [
      "git show HEAD",
      "git log -n1",
      "git ls-files",
      "git rev-parse --verify HEAD",
      "git blame -L1,1 -- file",
      "git diff --stat",
      "git grep pattern -- src",
    ];
    const records = await recordVerify(
      spec(
        commands.map((command) => ({ semanticId: "recorder", how: "disable helpers", command })),
      ),
      root,
    );
    for (const record of records) {
      expect(record).toMatchObject({ status: "ran", reason: null, exitCode: 0, commit });
      expect(`${record.stdout}${record.stderr}`).not.toContain("outside secret");
      expect(existsSync(join(root, "side-effect"))).toBe(false);
    }
  });

  test.each([
    ["git diff --stat", "clean"],
    ["git blame -L1,1 -- file", "clean"],
    ["git diff --stat", "process"],
    ["git blame -L1,1 -- file", "process"],
  ])("does not execute repository-local filters: %s (%s)", async (command, driver) => {
    const { root } = repository();
    const outside = createOutsideFile(root);
    run([
      "git",
      "-C",
      root,
      "config",
      `filter.probe.${driver}`,
      `touch '${join(root, "side-effect")}'; cat '${outside}';`,
    ]);
    run(["git", "-C", root, "config", "filter.probe.required", "true"]);
    writeFileSync(join(root, ".gitattributes"), "* filter=probe\n");
    writeFileSync(join(root, "file"), "changed\n");
    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "disable clean filters", command }]),
      root,
    );
    expect(existsSync(join(root, "side-effect"))).toBe(false);
    expect(`${records[0]?.stdout}${records[0]?.stderr}`).not.toContain("outside secret");
    expect(records[0]).toMatchObject({ status: "ran", exitCode: 0 });
  });

  test("ignores inherited Git configuration and repository worktree redirection", async () => {
    const { root, commit } = repository();
    const outside = createOutsideFile(root);
    const helper = `touch '${join(root, "side-effect")}'; cat '${outside}';`;
    const config = join(root, "..", "global-config");
    writeFileSync(config, `[core]\nfsmonitor = "${helper}"\n`);
    run(["git", "-C", root, "config", "core.worktree", join(outside, "..")]);
    const poison = {
      GIT_CONFIG_GLOBAL: config,
      GIT_CONFIG_SYSTEM: config,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.fsmonitor",
      GIT_CONFIG_VALUE_0: helper,
      GIT_CONFIG_PARAMETERS: "'core.fsmonitor=invalid'",
      GIT_EXTERNAL_DIFF: helper,
      GIT_PAGER: helper,
      PAGER: helper,
      GIT_DIR: join(root, "..", "nonexistent"),
      GIT_WORK_TREE: join(outside, ".."),
    };
    const previous = Object.fromEntries(Object.keys(poison).map((key) => [key, process.env[key]]));
    try {
      Object.assign(process.env, poison);
      const records = await recordVerify(
        spec([
          {
            semanticId: "recorder",
            how: "ignore inherited config",
            command: "git grep pattern -- src",
          },
        ]),
        root,
      );
      expect(records[0]).toMatchObject({
        status: "ran",
        exitCode: 0,
        stdout: "src/file:pattern\n",
        stderr: "",
        commit,
      });
      expect(existsSync(join(root, "side-effect"))).toBe(false);
      expect(`${records[0]?.stdout}${records[0]?.stderr}`).not.toContain("outside secret");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("does not resolve pretty-format aliases into signature verification helpers", async () => {
    const { root } = repository();
    const outside = createOutsideFile(root);
    const helper = join(root, "gpg-probe");
    writeFileSync(helper, `#!/bin/sh\ntouch '${join(root, "side-effect")}'\ncat '${outside}'\n`, {
      mode: 0o755,
    });
    const tree = run(["git", "-C", root, "rev-parse", "HEAD^{tree}"]).trim();
    const signed = Bun.spawnSync(
      ["git", "-C", root, "hash-object", "-t", "commit", "-w", "--stdin"],
      {
        stdin: Buffer.from(
          `tree ${tree}\nauthor Fixture <fixture@example.invalid> 1 +0000\n` +
            "committer Fixture <fixture@example.invalid> 1 +0000\n" +
            "gpgsig -----BEGIN PGP SIGNATURE-----\n \n invalid\n -----END PGP SIGNATURE-----\n\nfixture\n",
        ),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(signed.exitCode).toBe(0);
    run(["git", "-C", root, "update-ref", "HEAD", signed.stdout.toString().trim()]);
    for (const [key, value] of [
      ["gpg.program", helper],
      ["pretty.probe", "%G?"],
      ["format.pretty", "probe"],
      ["log.showSignature", "true"],
    ]) {
      if (key !== undefined && value !== undefined) run(["git", "-C", root, "config", key, value]);
    }
    const records = await recordVerify(
      spec(
        ["git log -n1", "git show --format=probe", "git show --format=%s"].map((command) => ({
          semanticId: "recorder",
          how: "disable signature helpers",
          command,
        })),
      ),
      root,
    );
    expect(existsSync(join(root, "side-effect"))).toBe(false);
    for (const record of records) {
      expect(record).toMatchObject({ status: "ran", exitCode: 0 });
      expect(`${record.stdout}${record.stderr}`).not.toContain("outside secret");
    }
  });

  test("does not refresh or write the Git index during a diff", async () => {
    const { root } = repository();
    createOutsideFile(root);
    const index = join(root, ".git/index");
    const before = await Bun.file(index).bytes();
    utimesSync(join(root, "file"), new Date(0), new Date(0));
    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "keep the index read-only", command: "git diff" }]),
      root,
    );
    expect(records[0]).toMatchObject({ status: "ran", exitCode: 0, stdout: "" });
    expect(await Bun.file(index).bytes()).toEqual(before);
    expect(existsSync(join(root, "side-effect"))).toBe(false);
    expect(`${records[0]?.stdout}${records[0]?.stderr}`).not.toContain("outside secret");
  });

  test("allows sed only in print-only mode", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "print one line", command: "sed -n '1p' README.md" }]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "fixture | & ; < > $ ` ( ) *\n",
    });
  });

  test("rejects cat of an absolute path outside the repository", async () => {
    const { root } = repository();
    const outside = createOutsideFile(root);

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject absolute path", command: `cat '${outside}'` }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects cat of a parent-relative path outside the repository", async () => {
    const { root } = repository();
    createOutsideFile(root);

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject parent path", command: "cat ../outside" }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects an in-repository symlink that points outside", async () => {
    const { root } = repository();
    symlinkSync(createOutsideFile(root), join(root, "outside-link"));

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject symlink escape", command: "cat outside-link" }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects parent traversal after an in-repository symlink", async () => {
    const { root } = repository();
    createOutsideFile(root);
    const outsideSubdirectory = join(root, "..", "outside", "subdirectory");
    mkdirSync(outsideSubdirectory);
    symlinkSync(outsideSubdirectory, join(root, "outside-directory-link"));

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "reject symlink and parent escape",
          command: "cat outside-directory-link/../secret.txt",
        },
      ]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects a tilde-prefixed cat operand", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject home path", command: "cat ~/x" }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("rejects an rg path outside the repository after its pattern", async () => {
    const { root } = repository();
    createOutsideFile(root);

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "reject rg path escape",
          command: "rg secret ../outside",
        },
      ]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "path outside repo" });
  });

  test("allows git show with a revision and confined path", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "read a file at HEAD",
          command: "git show HEAD:src/file",
        },
      ]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "pattern\n",
    });
  });

  test("allows rg with a pattern and confined directory", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "search source", command: "rg pattern src/" }]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "src/file:pattern\n",
    });
  });

  test("allows sed print-only mode with its script and a confined file", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "print five lines", command: "sed -n '1,5p' file" }]),
      root,
    );

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: null,
      exitCode: 0,
      stdout: "one\ntwo\nthree\nfour\nfive\n",
    });
  });

  test.each([
    ["sed write command", "sed -n '1w side-effect' README.md"],
    ["git output option", "git diff --output=side-effect"],
  ] as const)("rejects the %s before it can create a file", async (_label, command) => {
    const { root } = repository();
    createOutsideFile(root);

    const records = await recordVerify(
      spec([{ semanticId: "recorder", how: "reject write behavior", command }]),
      root,
    );

    expect(records[0]).toMatchObject({ status: "not-run", reason: "option not allowlisted" });
    expect(existsSync(join(root, "side-effect"))).toBe(false);
    expect(`${records[0]?.stdout}${records[0]?.stderr}`).not.toContain("outside secret");
  });

  test("kills a command at the injected timeout and awaits process exit", async () => {
    const { root } = repository();
    const fifo = `timeout-${basename(join(root, ".."))}`;
    run(["mkfifo", join(root, fifo)]);

    const records = await recordVerify(
      spec([
        {
          semanticId: "recorder",
          how: "read a FIFO with no writer",
          command: `cat ${fifo}`,
        },
      ]),
      root,
      { timeoutMs: 300 },
    );
    const processes = run(["ps", "-axo", "command="]);

    expect(records[0]).toMatchObject({
      status: "ran",
      reason: "timeout",
      exitCode: null,
      stdout: "",
      stderr: "",
    });
    expect(processes).not.toContain(`cat ${fifo}`);
  });

  test("caps stdout and stderr independently with a truncation marker", async () => {
    const { root } = repository();

    const records = await recordVerify(
      spec([
        { semanticId: "recorder", how: "read output", command: "cat README.md" },
        { semanticId: "recorder", how: "read an error", command: "cat missing-output-file" },
      ]),
      root,
      { outputLimitBytes: 8 },
    );

    expect(records[0]?.stdout).toBe("fixture …[truncated]");
    expect(records[0]?.stderr).toBe("");
    expect(records[1]?.stdout).toBe("");
    expect(records[1]?.stderr).toBe("cat: mis…[truncated]");
    expect(records[1]?.exitCode).not.toBe(0);
  });

  test("rejects missing, non-directory, and symlinked repository roots", async () => {
    const { root } = repository();
    const file = join(root, "not-a-directory");
    const link = join(root, "repo-link");
    writeFileSync(file, "");
    symlinkSync(root, link);
    const input = spec([]);

    await expect(recordVerify(input, join(root, "missing"))).rejects.toBeInstanceOf(InputError);
    await expect(recordVerify(input, file)).rejects.toBeInstanceOf(InputError);
    await expect(recordVerify(input, link)).rejects.toBeInstanceOf(InputError);
  });
});
