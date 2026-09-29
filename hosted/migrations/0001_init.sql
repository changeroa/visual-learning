-- visual-atlas D1 schema v1.
-- "commit" is an SQLite keyword; queries must quote the column as "commit".

CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  repo_name TEXT NOT NULL,
  "commit" TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE figures (
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  revision INTEGER NOT NULL,
  spec_json TEXT NOT NULL,
  scene_json TEXT NOT NULL,
  token TEXT NOT NULL,
  counter INTEGER NOT NULL,
  deprecated_anchors_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, artifact_id)
);

CREATE TABLE revisions (
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  token TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('publish', 'human-save')),
  spec_json TEXT NOT NULL,
  scene_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, artifact_id, token)
);

CREATE TABLE notes (
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  node_key TEXT NOT NULL,
  body TEXT NOT NULL,
  token TEXT NOT NULL,
  counter INTEGER NOT NULL,
  orphaned INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, artifact_id, node_key)
);

CREATE TABLE verify_runs (
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  semantic_id TEXT NOT NULL,
  how TEXT NOT NULL,
  command TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  "commit" TEXT,
  ran_at TEXT,
  PRIMARY KEY (project_id, artifact_id, idx)
);
