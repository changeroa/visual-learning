import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import type { D1Like, D1Result, D1Statement } from "../../hosted/worker/atlas-store";

const migrationsDirectory = new URL("../../hosted/migrations/", import.meta.url);

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

  constructor() {
    this.database.exec("PRAGMA foreign_keys = ON");
    const migrations = readdirSync(migrationsDirectory)
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    for (const migration of migrations)
      this.database.exec(readFileSync(new URL(migration, migrationsDirectory), "utf8"));
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
