use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Forward-only, immutable migrations for the library INDEX database.
    // Never edit a shipped migration; always append a new one with the next version.
    // The SQL here is kept byte-identical to the Drizzle schema in
    // src/lib/persistence/schema.ts and the generated SQL under migrations/.
    let migrations = vec![Migration {
        version: 1,
        description: "create_documents_index",
        sql: "CREATE TABLE IF NOT EXISTS documents (
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
            CREATE INDEX IF NOT EXISTS idx_documents_last_opened_at ON documents (last_opened_at);",
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:layoutforge-index.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
