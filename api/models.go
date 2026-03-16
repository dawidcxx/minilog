package main

import (
	"database/sql"
	"encoding/json"
	"time"
)

type server struct {
	stateDB *sql.DB
	logsDB  *sql.DB
	env     envConfig
}

type envConfig struct {
	stateDBPath  string
	pgURL        string
	cookieName   string
	secureCookie bool
}

type user struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
}

type serviceLog struct {
	Timestamp   time.Time       `json:"timestamp"`
	Hostname    string          `json:"hostname"`
	Service     string          `json:"service"`
	Level       string          `json:"level"`
	RequestID   *string         `json:"request_id"`
	ResourceID  *string         `json:"resource_id"`
	Message     *string         `json:"message"`
	MessageJSON json.RawMessage `json:"message_json"`
}

const (
	defaultPort            = "8080"
	defaultStateDB         = "./minilog_state.db"
	defaultPGURL           = "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable"
	defaultCookieName      = "minilog_session"
	defaultFrontendDistDir = "./frontend/dist"
	sessionTTL             = 24 * time.Hour
	sessionMaxAgeSeconds   = 60 * 60 * 24
)
