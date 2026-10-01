-- Counters survive project deletion. No foreign key may cascade into this table.
CREATE TABLE token_highwater (
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('figure', 'note')),
  node_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  PRIMARY KEY (project_id, artifact_id, kind, node_key)
);

INSERT INTO token_highwater
SELECT project_id, artifact_id, 'figure', '', counter FROM figures;
INSERT INTO token_highwater
SELECT project_id, artifact_id, 'note', node_key, counter FROM notes;

-- Triggers keep each successful write and its high-water mark in one transaction,
-- including writes by the previous Worker while this migration precedes deployment.
CREATE TRIGGER figure_token_insert AFTER INSERT ON figures BEGIN
  INSERT INTO token_highwater VALUES (NEW.project_id, NEW.artifact_id, 'figure', '', NEW.counter)
  ON CONFLICT(project_id, artifact_id, kind, node_key)
  DO UPDATE SET counter=MAX(counter, excluded.counter);
END;

CREATE TRIGGER figure_token_update AFTER UPDATE OF counter ON figures BEGIN
  INSERT INTO token_highwater VALUES (NEW.project_id, NEW.artifact_id, 'figure', '', NEW.counter)
  ON CONFLICT(project_id, artifact_id, kind, node_key)
  DO UPDATE SET counter=MAX(counter, excluded.counter);
END;

CREATE TRIGGER note_token_insert AFTER INSERT ON notes BEGIN
  INSERT INTO token_highwater VALUES (NEW.project_id, NEW.artifact_id, 'note', NEW.node_key, NEW.counter)
  ON CONFLICT(project_id, artifact_id, kind, node_key)
  DO UPDATE SET counter=MAX(counter, excluded.counter);
END;

CREATE TRIGGER note_token_update AFTER UPDATE OF counter ON notes BEGIN
  INSERT INTO token_highwater VALUES (NEW.project_id, NEW.artifact_id, 'note', NEW.node_key, NEW.counter)
  ON CONFLICT(project_id, artifact_id, kind, node_key)
  DO UPDATE SET counter=MAX(counter, excluded.counter);
END;
