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
	ID       int64  `json:"id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Status   string `json:"status"`
	IsRoot   bool   `json:"is_root"`
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

type notificationTransport struct {
	ID               int64   `json:"id"`
	Name             string  `json:"name"`
	Provider         string  `json:"provider"`
	DestinationType  string  `json:"destination_type"`
	DestinationLabel *string `json:"destination_label,omitempty"`
	DMUserID         *string `json:"dm_user_id,omitempty"`
	GuildID          *string `json:"guild_id,omitempty"`
	ChannelID        *string `json:"channel_id,omitempty"`
	Enabled          bool    `json:"enabled"`
	HasBotToken      bool    `json:"has_bot_token"`
	BotTokenMasked   *string `json:"bot_token_masked,omitempty"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

type notificationAlert struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	TransportID   int64  `json:"transport_id"`
	TransportName string `json:"transport_name"`
	MatchQuery    string `json:"match_query"`
	Message       string `json:"message"`
	Enabled       bool   `json:"enabled"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
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
