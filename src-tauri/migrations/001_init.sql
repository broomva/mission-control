-- Mission Control initial schema
-- Tables: projects, workspace_state, terminals, agents, agent_events

CREATE TABLE IF NOT EXISTS _meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO _meta (key, value) VALUES ('schema_version', '1');

CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    path       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_state (
    id                 INTEGER PRIMARY KEY CHECK (id = 1),
    layout             TEXT,
    active_project_id  TEXT
);

-- Seed the singleton row
INSERT OR IGNORE INTO workspace_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS terminals (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    title           TEXT NOT NULL,
    cols            INTEGER NOT NULL,
    rows            INTEGER NOT NULL,
    cwd             TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'running',
    scrollback_path TEXT
);

CREATE TABLE IF NOT EXISTS agents (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    agent_type  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'starting',
    prompt      TEXT,
    pid         INTEGER,
    session_id  TEXT,
    started_at  TEXT NOT NULL,
    cwd         TEXT NOT NULL,
    input_tokens          INTEGER NOT NULL DEFAULT 0,
    output_tokens         INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd              REAL NOT NULL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS agent_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id   TEXT NOT NULL,
    project_id TEXT NOT NULL,
    timestamp  TEXT NOT NULL,
    event_type TEXT NOT NULL,
    summary    TEXT NOT NULL,
    detail     TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_events_project ON agent_events(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent   ON agent_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_terminals_project    ON terminals(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_project       ON agents(project_id);
