package main

import (
	"database/sql"
	"os"
	"strings"

	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"
)

func openStateDB(path string) (*sql.DB, error) {
	// Ensure storage directory exists if using default path
	if strings.HasPrefix(path, "./storage/") {
		if err := os.MkdirAll("./storage", 0o755); err != nil {
			return nil, err
		}
	}
	return sql.Open("sqlite", path)
}

func openLogsDB(pgURL string) (*sql.DB, error) {
	if !strings.Contains(pgURL, "sslmode=") {
		if strings.Contains(pgURL, "?") {
			pgURL += "&sslmode=disable"
		} else {
			pgURL += "?sslmode=disable"
		}
	}

	return sql.Open("postgres", pgURL)
}

func initStateDB(db *sql.DB) error {
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE,
	username TEXT NOT NULL,
	password_hash TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'active',
	is_root INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
	token TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL,
	expires_at DATETIME NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS user_invitations (
	id TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL,
	invited_by_user_id INTEGER NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	accepted_at DATETIME,
	FOREIGN KEY(user_id) REFERENCES users(id),
	FOREIGN KEY(invited_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_user_id ON user_invitations(user_id);

CREATE TABLE IF NOT EXISTS notification_transports (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE,
	provider TEXT NOT NULL,
	config_json TEXT NOT NULL DEFAULT '{}',
	enabled INTEGER NOT NULL DEFAULT 1,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_transports_provider ON notification_transports(provider);

CREATE TABLE IF NOT EXISTS notification_alerts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	transport_id INTEGER NOT NULL,
	match_query TEXT NOT NULL,
	message TEXT NOT NULL,
	enabled INTEGER NOT NULL DEFAULT 1,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY(transport_id) REFERENCES notification_transports(id)
);

CREATE INDEX IF NOT EXISTS idx_notification_alerts_transport_id ON notification_alerts(transport_id);
`)
	if err != nil {
		return err
	}

	if err := addColumnIfMissing(db, "users", "username", "TEXT"); err != nil {
		return err
	}
	if err := addColumnIfMissing(db, "users", "status", "TEXT NOT NULL DEFAULT 'active'"); err != nil {
		return err
	}
	if err := addColumnIfMissing(db, "users", "is_root", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}

	if _, err := db.Exec(`UPDATE users SET username = email WHERE username IS NULL OR TRIM(username) = ''`); err != nil {
		return err
	}

	if _, err := db.Exec(`UPDATE users SET status = 'active' WHERE status IS NULL OR TRIM(status) = ''`); err != nil {
		return err
	}

	if _, err := db.Exec(`
UPDATE users
SET is_root = 1
WHERE id = (
	SELECT id FROM users ORDER BY id ASC LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM users WHERE is_root = 1)
`); err != nil {
		return err
	}

	return nil
}

func addColumnIfMissing(db *sql.DB, tableName, columnName, columnDef string) error {
	_, err := db.Exec("ALTER TABLE " + tableName + " ADD COLUMN " + columnName + " " + columnDef)
	if err == nil {
		return nil
	}

	errText := strings.ToLower(err.Error())
	if strings.Contains(errText, "duplicate column name") {
		return nil
	}

	return err
}
