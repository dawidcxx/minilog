package main

import (
	"os"
	"strings"
)

func loadEnv() envConfig {
	stateDBPath := strings.TrimSpace(os.Getenv("MINILOG_STATE_DB"))
	if stateDBPath == "" {
		stateDBPath = defaultStateDB
	}

	pgURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if pgURL == "" {
		pgURL = defaultPGURL
	}

	return envConfig{
		stateDBPath:  stateDBPath,
		pgURL:        pgURL,
		cookieName:   defaultCookieName,
		secureCookie: parseBoolEnv("MINILOG_SECURE_COOKIE"),
	}
}

func parseBoolEnv(name string) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	return value == "1" || value == "true" || value == "yes" || value == "on"
}
