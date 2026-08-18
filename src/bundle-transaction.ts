import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { ConflictError, RuntimeError } from "./errors";

type FaultStep = "before-first-publish" | "between-publishes" | "parent-fsync-after-png-publish";
type InterruptStep = "between-publishes";

type Journal = {
  readonly schemaVersion: 1;
  readonly jsonTarget: string;
  readonly pngTarget: string;
  readonly existingJson: boolean;
  readonly existingPng: boolean;
  readonly committed: boolean;
};

export type BundlePublishInput = {
  readonly jsonTarget: string;
  readonly pngTarget: string;
  readonly stagedJson: string;
  readonly stagedPng: string;
  readonly tempRoot: string;
};

export type BundlePublishControl = {
  readonly failAt?: FaultStep;
  readonly interruptAt?: InterruptStep;
  readonly markAt?: InterruptStep;
  readonly holdAt?: InterruptStep;
  readonly signalAt?: InterruptStep;
};

class InterruptError extends Error {
  readonly name = "InterruptError";
}

export function bundleTransactionPaths(
  jsonTarget: string,
  pngTarget: string,
): {
  readonly txRoot: string;
  readonly lockPath: string;
  readonly journalPath: string;
  readonly stagedJson: string;
  readonly stagedPng: string;
  readonly backupJson: string;
  readonly backupPng: string;
} {
  const directory = dirname(jsonTarget);
  const jsonStem = basename(jsonTarget, extname(jsonTarget));
  const pngStem = basename(pngTarget, extname(pngTarget));
  const txRoot = join(directory, `.${jsonStem}--${pngStem}.bundle-tx`);
  return {
    txRoot,
    lockPath: join(txRoot, "lock"),
    journalPath: join(txRoot, "journal.json"),
    stagedJson: join(txRoot, "staged.json"),
    stagedPng: join(txRoot, "staged.png"),
    backupJson: join(txRoot, "backup.json"),
    backupPng: join(txRoot, "backup.png"),
  };
}

function fsyncPath(path: string): void {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function fsyncDirectory(path: string, control: BundlePublishControl, step?: FaultStep): void {
  if (step !== undefined && control.failAt === step)
    throw new RuntimeError(`injected failure: ${step}`);
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function removeFileIfPresent(path: string): void {
  if (!existsSync(path)) return;
  const status = lstatSync(path);
  if (!status.isFile() && !status.isSymbolicLink()) return;
  unlinkSync(path);
}

function writeJournal(path: string, journal: Journal, control: BundlePublishControl): void {
  writeFileSync(path, `${JSON.stringify(journal, null, 2)}\n`);
  fsyncPath(path);
  fsyncDirectory(dirname(path), control);
}

function readJournal(path: string): Journal {
  return JSON.parse(readFileSync(path, "utf8")) as Journal;
}

function maybeInterrupt(control: BundlePublishControl, step: InterruptStep): void {
  if (control.markAt === step) process.stderr.write(`VISUAL_NOTE_TX_MARK ${step}\n`);
  if (control.signalAt === step) {
    process.kill(process.pid, "SIGTERM");
    throw new InterruptError(`injected sigterm: ${step}`);
  }
  if (control.holdAt === step) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  if (control.interruptAt === step) throw new InterruptError(`injected interrupt: ${step}`);
}

function rollbackJournal(journal: Journal): void {
  const paths = bundleTransactionPaths(journal.jsonTarget, journal.pngTarget);
  const restore = (target: string, backup: string, existed: boolean, staged: string): void => {
    if (existsSync(backup)) {
      removeFileIfPresent(target);
      renameSync(backup, target);
      return;
    }
    if (!existed && !existsSync(staged)) removeFileIfPresent(target);
  };
  restore(journal.pngTarget, paths.backupPng, journal.existingPng, paths.stagedPng);
  restore(journal.jsonTarget, paths.backupJson, journal.existingJson, paths.stagedJson);
}

function cleanupJournal(journal: Journal, control: BundlePublishControl): void {
  const paths = bundleTransactionPaths(journal.jsonTarget, journal.pngTarget);
  removeFileIfPresent(paths.backupPng);
  removeFileIfPresent(paths.backupJson);
  removeFileIfPresent(paths.journalPath);
  removeFileIfPresent(paths.lockPath);
  rmSync(paths.txRoot, { recursive: true, force: true });
  fsyncDirectory(dirname(paths.txRoot), control);
}

function recoverJournal(
  paths: ReturnType<typeof bundleTransactionPaths>,
  control: BundlePublishControl,
): void {
  if (!existsSync(paths.journalPath)) return;
  const journal = readJournal(paths.journalPath);
  if (!journal.committed) rollbackJournal(journal);
  cleanupJournal(journal, control);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(lockPath: string): number {
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    const descriptor = openSync(lockPath, "wx", 0o600);
    writeSync(descriptor, `${process.pid}\n`);
    fsyncSync(descriptor);
    return descriptor;
  } catch {
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    if (Number.isInteger(pid) && !pidAlive(pid)) {
      unlinkSync(lockPath);
      const descriptor = openSync(lockPath, "wx", 0o600);
      writeSync(descriptor, `${process.pid}\n`);
      fsyncSync(descriptor);
      return descriptor;
    }
    throw new ConflictError(`bundle publication in progress: ${lockPath}`);
  }
}

export function publishBundleAtomically(
  input: BundlePublishInput,
  control: BundlePublishControl = {},
): void {
  const directory = dirname(input.jsonTarget);
  if (directory !== dirname(input.pngTarget))
    throw new RuntimeError("bundle targets must share a parent");
  const paths = bundleTransactionPaths(input.jsonTarget, input.pngTarget);
  const lockDescriptor = acquireLock(paths.lockPath);
  try {
    recoverJournal(paths, control);
    mkdirSync(paths.txRoot, { recursive: true });
    fsyncPath(input.stagedPng);
    fsyncPath(input.stagedJson);
    fsyncDirectory(input.tempRoot, control);
    renameSync(input.stagedPng, paths.stagedPng);
    renameSync(input.stagedJson, paths.stagedJson);
    fsyncDirectory(paths.txRoot, control);
    const journal: Journal = {
      schemaVersion: 1,
      jsonTarget: input.jsonTarget,
      pngTarget: input.pngTarget,
      existingJson: existsSync(input.jsonTarget),
      existingPng: existsSync(input.pngTarget),
      committed: false,
    };
    writeJournal(paths.journalPath, journal, control);
    if (journal.existingPng) renameSync(input.pngTarget, paths.backupPng);
    if (journal.existingJson) renameSync(input.jsonTarget, paths.backupJson);
    fsyncDirectory(directory, control);
    if (control.failAt === "before-first-publish")
      throw new RuntimeError("injected failure: before-first-publish");
    renameSync(paths.stagedPng, input.pngTarget);
    fsyncDirectory(directory, control, "parent-fsync-after-png-publish");
    if (control.failAt === "between-publishes")
      throw new RuntimeError("injected failure: between-publishes");
    maybeInterrupt(control, "between-publishes");
    renameSync(paths.stagedJson, input.jsonTarget);
    fsyncDirectory(directory, control);
    writeJournal(paths.journalPath, { ...journal, committed: true }, control);
    cleanupJournal(journal, control);
  } catch (error) {
    if (error instanceof InterruptError) throw error;
    if (existsSync(paths.journalPath)) {
      const journal = readJournal(paths.journalPath);
      rollbackJournal(journal);
      cleanupJournal(journal, control);
    }
    throw error;
  } finally {
    closeSync(lockDescriptor);
    removeFileIfPresent(paths.lockPath);
  }
}
