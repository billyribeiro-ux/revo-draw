-- Migration 0001 — create the library index table.
-- FORWARD-ONLY and IMMUTABLE: never edit this file once shipped; add a new migration instead.
-- This SQL is kept byte-identical with the Rust migration in src-tauri/src/lib.rs (version 1),
-- which is what tauri-plugin-sql actually applies at runtime. This file is the canonical,
-- reviewable record of the schema and is also what drizzle-kit reconciles against.

CREATE TABLE IF NOT EXISTS documents (
	id TEXT PRIMARY KEY NOT NULL,
	name TEXT NOT NULL,
	file_path TEXT,
	thumbnail TEXT,
	tags TEXT NOT NULL DEFAULT '[]',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	last_opened_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_last_opened_at ON documents (last_opened_at);
