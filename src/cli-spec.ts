import { optional, parseOptions, required } from "./arguments";
import { writeResult } from "./io";
import { inspectSpec, refreshSpec, restoreArtifact } from "./operations";

export function runSpecCommand(
  command: "extend" | "refresh" | "restore",
  argv: readonly string[],
): void {
  const allowed =
    command === "refresh"
      ? new Set(["--spec", "--vault", "--expected-vault", "--project", "--expected-token"])
      : command === "restore"
        ? new Set([
            "--spec",
            "--vault",
            "--expected-vault",
            "--project",
            "--artifact-id",
            "--revision-token",
            "--expected-token",
          ])
        : new Set(["--spec"]);
  const options = parseOptions(argv, allowed);
  const mutatingRefresh =
    command === "refresh" &&
    optional(options, "--vault") !== undefined &&
    optional(options, "--expected-vault") !== undefined &&
    optional(options, "--project") !== undefined &&
    optional(options, "--expected-token") !== undefined;
  const mutatingRestore =
    command === "restore" &&
    optional(options, "--vault") !== undefined &&
    optional(options, "--expected-vault") !== undefined &&
    optional(options, "--project") !== undefined &&
    optional(options, "--artifact-id") !== undefined &&
    optional(options, "--revision-token") !== undefined &&
    optional(options, "--expected-token") !== undefined;
  const result = mutatingRefresh
    ? refreshSpec({
        vault: required(options, "--vault"),
        expectedVault: required(options, "--expected-vault"),
        project: required(options, "--project"),
        specPath: required(options, "--spec"),
        expectedToken: required(options, "--expected-token"),
      })
    : mutatingRestore
      ? restoreArtifact({
          vault: required(options, "--vault"),
          expectedVault: required(options, "--expected-vault"),
          project: required(options, "--project"),
          artifactId: required(options, "--artifact-id"),
          revisionToken: required(options, "--revision-token"),
          expectedToken: required(options, "--expected-token"),
        })
      : inspectSpec(command, required(options, "--spec"));
  writeResult(result, options.json);
}
