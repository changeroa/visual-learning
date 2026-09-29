import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import type { D1Like, D1Result, D1Statement } from "../../hosted/worker/atlas-store";

export const atlasSchema = `
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY, repo_name TEXT NOT NULL, "commit" TEXT, published_at TEXT NOT NULL
);
CREATE TABLE figures (
  project_id TEXT NOT NULL, artifact_id TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL,
  revision INTEGER NOT NULL, spec_json TEXT NOT NULL, scene_json TEXT NOT NULL, token TEXT NOT NULL,
  counter INTEGER NOT NULL, deprecated_anchors_json TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, artifact_id)
);
CREATE TABLE revisions (
  project_id TEXT NOT NULL, artifact_id TEXT NOT NULL, token TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('publish', 'human-save')),
  spec_json TEXT NOT NULL, scene_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, artifact_id, token)
);
CREATE TABLE notes (
  project_id TEXT NOT NULL, artifact_id TEXT NOT NULL, node_key TEXT NOT NULL, body TEXT NOT NULL,
  token TEXT NOT NULL, counter INTEGER NOT NULL, orphaned INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, PRIMARY KEY (project_id, artifact_id, node_key)
);
CREATE TABLE verify_runs (
  project_id TEXT NOT NULL, artifact_id TEXT NOT NULL, idx INTEGER NOT NULL, semantic_id TEXT,
  how TEXT NOT NULL, command TEXT, status TEXT NOT NULL, reason TEXT, exit_code INTEGER,
  stdout TEXT NOT NULL, stderr TEXT NOT NULL, "commit" TEXT, ran_at TEXT,
  PRIMARY KEY (project_id, artifact_id, idx)
);
`;

export const migrationPath = new URL("../../hosted/migrations/0001_init.sql", import.meta.url);

class SQLiteStatement implements D1Statement {
  constructor(
    readonly database: Database,
    readonly sql: string,
    readonly values: (string | number | null)[] = [],
  ) {}

  bind(...values: (string | number | null)[]): SQLiteStatement {
    return new SQLiteStatement(this.database, this.sql, values);
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.database.query(this.sql).get(...this.values);
    if (row === null) return null;
    return (column === undefined ? row : (row as Record<string, unknown>)[column]) as T;
  }

  execute<T>(): D1Result<T> {
    const results = this.database.query(this.sql).all(...this.values) as T[];
    const meta = this.database.query("SELECT changes() AS changes").get() as { changes: number };
    return { success: true, results, meta };
  }

  async all<T>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async run<T>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }
}

export class SQLiteD1 implements D1Like {
  readonly database = new Database(":memory:");

  constructor(
    schema = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : atlasSchema,
  ) {
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(schema);
  }

  prepare(sql: string): SQLiteStatement {
    return new SQLiteStatement(this.database, sql);
  }

  withSession(_constraint: "first-primary"): SQLiteD1 {
    return this;
  }

  async batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]> {
    return this.database.transaction(() =>
      statements.map((statement) => {
        if (!(statement instanceof SQLiteStatement) || statement.database !== this.database)
          throw new TypeError("batch statement belongs to a different database");
        return statement.execute<T>();
      }),
    )();
  }

  close(): void {
    this.database.close();
  }
}
