package main

import (
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func newServer(env envConfig, stateDB, logsDB *sql.DB) *server {
	return &server{
		stateDB: stateDB,
		logsDB:  logsDB,
		env:     env,
	}
}

func (s *server) serve(addr string) error {
	return http.ListenAndServe(addr, s.routes())
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/bootstrap", s.handleBootstrap)
	mux.HandleFunc("/api/register", s.handleRegister)
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.HandleFunc("/api/logout", s.handleLogout)
	mux.HandleFunc("/api/me", s.handleMe)
	mux.HandleFunc("/api/logs", s.handleLogs)

	if _, err := os.Stat(defaultFrontendDistDir); err == nil {
		mux.Handle("/", frontendHandler(defaultFrontendDistDir))
	}

	return withLogging(mux)
}

func frontendHandler(distDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		target, err := safeJoin(distDir, r.URL.Path)
		if err == nil {
			if st, statErr := os.Stat(target); statErr == nil && !st.IsDir() {
				http.ServeFile(w, r, target)
				return
			}
		}

		http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
	})
}

func safeJoin(basePath, requestPath string) (string, error) {
	cleaned := filepath.Clean("/" + requestPath)
	rel := strings.TrimPrefix(cleaned, "/")

	baseAbs, err := filepath.Abs(basePath)
	if err != nil {
		return "", err
	}

	targetAbs, err := filepath.Abs(filepath.Join(baseAbs, rel))
	if err != nil {
		return "", err
	}

	if targetAbs == baseAbs {
		return targetAbs, nil
	}

	prefix := baseAbs + string(os.PathSeparator)
	if strings.HasPrefix(targetAbs, prefix) {
		return targetAbs, nil
	}

	return "", errors.New("invalid path")
}
