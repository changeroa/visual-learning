import { readFileSync } from "node:fs";
import { join } from "node:path";

export type AgentClient = "senpi" | "codex" | "claude";

export async function runBounded(command: string[], env: Record<string, string>, cwd: string) {
  const child = Bun.spawn(command, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, 180_000);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  return { stdout, stderr, exitCode, timedOut };
}

function invocation(
  client: AgentClient,
  executable: string,
  home: string,
  prompt: string,
): string[] {
  if (client === "senpi")
    return [
      executable,
      "--provider",
      "openai-codex",
      "--model",
      "gpt-5.6-sol",
      "--thinking",
      "off",
      "--no-session",
      "--no-context-files",
      "--no-extensions",
      "--tools",
      "bash",
      "--print",
      `/skill:visual-learning ${prompt}`,
    ];
  if (client === "codex")
    return [
      executable,
      "--ask-for-approval",
      "never",
      "-C",
      home,
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--sandbox",
      "read-only",
      "--output-last-message",
      join(home, "codex-last.txt"),
      `$visual-learning ${prompt}`,
    ];
  return [
    executable,
    "--print",
    "--model",
    "haiku",
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    "Bash",
    "--no-session-persistence",
    `/visual-learning ${prompt}`,
  ];
}

function isolatedEnv(client: AgentClient, home: string): Record<string, string> {
  const env = { ...process.env, HOME: home } as Record<string, string>;
  delete env["PI_SESSION_ID"];
  delete env["PI_CODING_AGENT"];
  if (client === "senpi") env["SENPI_CODING_AGENT_DIR"] = join(home, ".senpi/agent");
  if (client === "codex") env["CODEX_HOME"] = join(home, ".codex");
  return env;
}

export async function runAgentSession(
  client: AgentClient,
  executable: string,
  home: string,
  prompt: string,
) {
  const run = await runBounded(
    invocation(client, executable, home, prompt),
    isolatedEnv(client, home),
    home,
  );
  const output =
    client === "codex" && run.exitCode === 0
      ? readFileSync(join(home, "codex-last.txt"), "utf8")
      : run.stdout;
  return { ...run, output };
}
