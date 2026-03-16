package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func (s *server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	hasUser, err := s.hasAnyUser(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read state"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"has_user": hasUser})
}

func (s *server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	type req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	var payload req
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return
	}

	email := strings.TrimSpace(strings.ToLower(payload.Email))
	if email == "" || payload.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email and password are required"})
		return
	}

	hasUser, err := s.hasAnyUser(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read state"})
		return
	}
	if hasUser {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "registration already completed"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(payload.Password), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to secure password"})
		return
	}

	res, err := s.stateDB.ExecContext(r.Context(), `INSERT INTO users (email, password_hash) VALUES (?, ?)`, email, string(hash))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to register user"})
		return
	}

	userID, err := res.LastInsertId()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
		return
	}

	token, err := newSessionToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create session"})
		return
	}

	if err := s.createSession(r.Context(), token, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create session"})
		return
	}

	s.setSessionCookie(w, token)
	writeJSON(w, http.StatusCreated, map[string]any{"user": user{ID: userID, Email: email}})
}

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	type req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	var payload req
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return
	}

	email := strings.TrimSpace(strings.ToLower(payload.Email))
	if email == "" || payload.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email and password are required"})
		return
	}

	var u user
	var passwordHash string
	err := s.stateDB.QueryRowContext(r.Context(), `SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1`, email).Scan(&u.ID, &u.Email, &passwordHash)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to login"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(payload.Password)); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}

	token, err := newSessionToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create session"})
		return
	}

	if err := s.createSession(r.Context(), token, u.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create session"})
		return
	}

	s.setSessionCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	cookie, err := r.Cookie(s.env.cookieName)
	if err == nil && cookie.Value != "" {
		_, _ = s.stateDB.ExecContext(r.Context(), `DELETE FROM sessions WHERE token = ?`, cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     s.env.cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.env.secureCookie,
	})

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleMe(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	u, err := s.requireAuth(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *server) hasAnyUser(ctx context.Context) (bool, error) {
	var count int
	err := s.stateDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *server) requireAuth(r *http.Request) (*user, error) {
	cookie, err := r.Cookie(s.env.cookieName)
	if err != nil || cookie.Value == "" {
		return nil, errors.New("missing session")
	}

	var u user
	err = s.stateDB.QueryRowContext(
		r.Context(),
		`SELECT u.id, u.email
		 FROM sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
		 LIMIT 1`,
		cookie.Value,
	).Scan(&u.ID, &u.Email)
	if err != nil {
		return nil, err
	}

	return &u, nil
}

func (s *server) createSession(ctx context.Context, token string, userID int64) error {
	expiresAt := time.Now().UTC().Add(sessionTTL)
	_, err := s.stateDB.ExecContext(ctx, `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`, token, userID, expiresAt)
	return err
}

func (s *server) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.env.cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.env.secureCookie,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   sessionMaxAgeSeconds,
	})
}

func newSessionToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
