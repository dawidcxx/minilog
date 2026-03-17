package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type userListItem struct {
	ID             int64   `json:"id"`
	Email          string  `json:"email"`
	Username       string  `json:"username"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"created_at"`
	IsRoot         bool    `json:"is_root"`
	InvitationID   *string `json:"invitation_id,omitempty"`
	InvitationLink *string `json:"invitation_link,omitempty"`
}

type invitationDetails struct {
	InvitationID string `json:"invitation_id"`
	Email        string `json:"email"`
	Username     string `json:"username"`
	Status       string `json:"status"`
}

func (s *server) handleUsers(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	currentUser, err := s.requireAuth(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !currentUser.IsRoot {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only root user can manage users"})
		return
	}

	rows, err := s.stateDB.QueryContext(
		r.Context(),
		`SELECT
			u.id,
			u.email,
			u.username,
			u.status,
			u.created_at,
			u.is_root,
			(
				SELECT i.id
				FROM user_invitations i
				WHERE i.user_id = u.id AND i.accepted_at IS NULL
				ORDER BY i.created_at DESC
				LIMIT 1
			) AS invitation_id
		FROM users u
		ORDER BY u.created_at DESC, u.id DESC`,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load users"})
		return
	}
	defer rows.Close()

	result := make([]userListItem, 0)
	for rows.Next() {
		var item userListItem
		var invitationID sql.NullString
		if err := rows.Scan(&item.ID, &item.Email, &item.Username, &item.Status, &item.CreatedAt, &item.IsRoot, &invitationID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read users"})
			return
		}

		if invitationID.Valid {
			value := invitationID.String
			item.InvitationID = &value
			link := fmt.Sprintf("/register/%s", value)
			item.InvitationLink = &link
		}

		result = append(result, item)
	}

	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read users"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"users": result})
}

func (s *server) handleCreateUserInvitation(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	currentUser, err := s.requireAuth(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !currentUser.IsRoot {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only root user can invite users"})
		return
	}

	type req struct {
		Email string `json:"email"`
	}

	var payload req
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return
	}

	email := strings.TrimSpace(strings.ToLower(payload.Email))
	if email == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email is required"})
		return
	}

	var existingID int64
	if err := s.stateDB.QueryRowContext(r.Context(), `SELECT id FROM users WHERE email = ? LIMIT 1`, email).Scan(&existingID); err == nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "user with this email already exists"})
		return
	} else if !errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to validate user"})
		return
	}

	invitationID, err := newSessionToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create invitation"})
		return
	}

	temporaryHash, err := bcrypt.GenerateFromPassword([]byte(invitationID), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to secure invitation"})
		return
	}

	tx, err := s.stateDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create invitation"})
		return
	}
	defer tx.Rollback()

	username := usernameFromEmail(email)
	res, err := tx.ExecContext(
		r.Context(),
		`INSERT INTO users (email, username, password_hash, status, is_root) VALUES (?, ?, ?, 'invited', 0)`,
		email,
		username,
		string(temporaryHash),
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
		return
	}

	userID, err := res.LastInsertId()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
		return
	}

	if _, err := tx.ExecContext(
		r.Context(),
		`INSERT INTO user_invitations (id, user_id, invited_by_user_id) VALUES (?, ?, ?)`,
		invitationID,
		userID,
		currentUser.ID,
	); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist invitation"})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save invitation"})
		return
	}

	link := fmt.Sprintf("/register/%s", invitationID)
	writeJSON(w, http.StatusCreated, map[string]any{
		"user": map[string]any{
			"id":         userID,
			"email":      email,
			"username":   username,
			"status":     "invited",
			"created_at": time.Now().UTC().Format(time.RFC3339),
		},
		"invitation": map[string]any{
			"id":   invitationID,
			"link": link,
		},
	})
}

func (s *server) handleInvitationByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/invitations/")
	if path == "" {
		http.NotFound(w, r)
		return
	}

	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}

	invitationID := parts[0]
	if len(parts) == 1 && r.Method == http.MethodGet {
		s.handleGetInvitation(w, r, invitationID)
		return
	}

	if len(parts) == 2 && parts[1] == "complete" && r.Method == http.MethodPost {
		s.handleCompleteInvitation(w, r, invitationID)
		return
	}

	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func (s *server) handleGetInvitation(w http.ResponseWriter, r *http.Request, invitationID string) {
	var details invitationDetails
	err := s.stateDB.QueryRowContext(
		r.Context(),
		`SELECT i.id, u.email, u.username, u.status
		 FROM user_invitations i
		 JOIN users u ON u.id = i.user_id
		 WHERE i.id = ?
		 LIMIT 1`,
		invitationID,
	).Scan(&details.InvitationID, &details.Email, &details.Username, &details.Status)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "invitation not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read invitation"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"invitation": details})
}

func (s *server) handleCompleteInvitation(w http.ResponseWriter, r *http.Request, invitationID string) {
	type req struct {
		Password string `json:"password"`
	}

	var payload req
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return
	}

	password := strings.TrimSpace(payload.Password)
	if password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password is required"})
		return
	}

	tx, err := s.stateDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to complete registration"})
		return
	}
	defer tx.Rollback()

	var userID int64
	var email string
	var username string
	var status string
	var acceptedAt sql.NullTime
	err = tx.QueryRowContext(
		r.Context(),
		`SELECT u.id, u.email, u.username, u.status, i.accepted_at
		 FROM user_invitations i
		 JOIN users u ON u.id = i.user_id
		 WHERE i.id = ?
		 LIMIT 1`,
		invitationID,
	).Scan(&userID, &email, &username, &status, &acceptedAt)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "invitation not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to validate invitation"})
		return
	}

	if acceptedAt.Valid || strings.ToLower(strings.TrimSpace(status)) == "active" {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "invitation already used"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to secure password"})
		return
	}

	if _, err := tx.ExecContext(
		r.Context(),
		`UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?`,
		string(hash),
		userID,
	); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to activate user"})
		return
	}

	if _, err := tx.ExecContext(
		r.Context(),
		`UPDATE user_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?`,
		invitationID,
	); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to finalize invitation"})
		return
	}

	if err := tx.Commit(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to complete registration"})
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
	writeJSON(w, http.StatusOK, map[string]any{
		"user": user{ID: userID, Email: email, Username: username, Status: "active", IsRoot: false},
	})
}
