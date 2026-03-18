package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

const (
	notificationProviderDiscordAssistant = "discord_assistant"
	destinationTypeDirectMessage         = "direct_message"
	destinationTypeGuildTextChannel      = "guild_text_channel"
)

type notificationTransportPayload struct {
	Name             string `json:"name"`
	Provider         string `json:"provider"`
	DestinationType  string `json:"destination_type"`
	DestinationLabel string `json:"destination_label"`
	DMUserID         string `json:"dm_user_id"`
	GuildID          string `json:"guild_id"`
	ChannelID        string `json:"channel_id"`
	BotToken         string `json:"bot_token"`
	Enabled          *bool  `json:"enabled"`
}

type discordAssistantTransportConfig struct {
	DestinationType  string `json:"destination_type"`
	DestinationLabel string `json:"destination_label,omitempty"`
	DMUserID         string `json:"dm_user_id,omitempty"`
	GuildID          string `json:"guild_id,omitempty"`
	ChannelID        string `json:"channel_id,omitempty"`
	BotToken         string `json:"bot_token,omitempty"`
}

type notificationAlertPayload struct {
	Name        string `json:"name"`
	TransportID int64  `json:"transport_id"`
	MatchQuery  string `json:"match_query"`
	Message     string `json:"message"`
	Enabled     *bool  `json:"enabled"`
}

type alertMatchQuery struct {
	Service    string
	Level      string
	ResourceID string
}

func (s *server) handleNotificationTransports(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.listNotificationTransports(w, r)
		return
	}
	if r.Method == http.MethodPost {
		s.createNotificationTransport(w, r)
		return
	}

	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func (s *server) handleNotificationTransportByID(w http.ResponseWriter, r *http.Request) {
	transportID, ok := notificationIDFromPath(r.URL.Path, "/api/notifications/transports/")
	if !ok {
		http.NotFound(w, r)
		return
	}

	if r.Method == http.MethodPut {
		s.updateNotificationTransport(w, r, transportID)
		return
	}

	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func (s *server) handleNotificationAlerts(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.listNotificationAlerts(w, r)
		return
	}
	if r.Method == http.MethodPost {
		s.createNotificationAlert(w, r)
		return
	}

	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func (s *server) handleNotificationAlertByID(w http.ResponseWriter, r *http.Request) {
	alertID, ok := notificationIDFromPath(r.URL.Path, "/api/notifications/alerts/")
	if !ok {
		http.NotFound(w, r)
		return
	}

	if r.Method == http.MethodPut {
		s.updateNotificationAlert(w, r, alertID)
		return
	}

	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func (s *server) listNotificationTransports(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireRootAuth(w, r); !ok {
		return
	}

	rows, err := s.stateDB.QueryContext(
		r.Context(),
		`SELECT id, name, provider, config_json, enabled, created_at, updated_at
		 FROM notification_transports
		 ORDER BY created_at DESC, id DESC`,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load transports"})
		return
	}
	defer rows.Close()

	result := make([]notificationTransport, 0)
	for rows.Next() {
		item, scanErr := scanNotificationTransport(rows)
		if scanErr != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read transports"})
			return
		}
		result = append(result, item)
	}

	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read transports"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"transports": result})
}

func (s *server) createNotificationTransport(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireRootAuth(w, r); !ok {
		return
	}

	var payload notificationTransportPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return
	}

	payload, err := validateTransportPayload(payload)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if strings.TrimSpace(payload.BotToken) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bot_token is required"})
		return
	}

	configJSON, err := buildTransportConfigJSON(payload)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	enabled := true
	if payload.Enabled != nil {
		enabled = *payload.Enabled
	}

	_, execErr := s.stateDB.ExecContext(
		r.Context(),
		`INSERT INTO notification_transports
			(name, provider, config_json, enabled)
		 VALUES (?, ?, ?, ?)`,
		payload.Name,
		payload.Provider,
		configJSON,
		boolToInt(enabled),
	)
	if execErr != nil {
		errText := strings.ToLower(execErr.Error())
		if strings.Contains(errText, "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "transport with this name already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create transport"})
		return
	}

	s.listNotificationTransports(w, r)
}

func (s *server) updateNotificationTransport(w http.ResponseWriter, r *http.Request, transportID int64) {
	if _, ok := s.requireRootAuth(w, r); !ok {
		return
	}

	var existingConfigJSON string
	err := s.stateDB.QueryRowContext(
		r.Context(),
		`SELECT config_json FROM notification_transports WHERE id = ? LIMIT 1`,
		transportID,
	).Scan(&existingConfigJSON)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "transport not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read transport"})
		return
	}

	var payload notificationTransportPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return
	}

	payload, err = validateTransportPayload(payload)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	existingConfig, err := decodeDiscordConfigFromJSON(existingConfigJSON)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read transport config"})
		return
	}

	botToken := strings.TrimSpace(payload.BotToken)
	if botToken == "" {
		botToken = strings.TrimSpace(existingConfig.BotToken)
	}
	if botToken == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bot_token is required"})
		return
	}
	payload.BotToken = botToken

	configJSON, err := buildTransportConfigJSON(payload)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	enabled := true
	if payload.Enabled != nil {
		enabled = *payload.Enabled
	}

	result, execErr := s.stateDB.ExecContext(
		r.Context(),
		`UPDATE notification_transports
		 SET name = ?,
			 provider = ?,
			 config_json = ?,
			 enabled = ?,
			 updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		payload.Name,
		payload.Provider,
		configJSON,
		boolToInt(enabled),
		transportID,
	)
	if execErr != nil {
		errText := strings.ToLower(execErr.Error())
		if strings.Contains(errText, "unique") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "transport with this name already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update transport"})
		return
	}

	rowsAffected, rowsErr := result.RowsAffected()
	if rowsErr != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update transport"})
		return
	}
	if rowsAffected == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "transport not found"})
		return
	}

	s.listNotificationTransports(w, r)
}

func (s *server) listNotificationAlerts(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireRootAuth(w, r); !ok {
		return
	}

	rows, err := s.stateDB.QueryContext(
		r.Context(),
		`SELECT a.id, a.name, a.transport_id, t.name, a.match_query, a.message, a.enabled, a.created_at, a.updated_at
		 FROM notification_alerts a
		 JOIN notification_transports t ON t.id = a.transport_id
		 ORDER BY a.created_at DESC, a.id DESC`,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load alerts"})
		return
	}
	defer rows.Close()

	result := make([]notificationAlert, 0)
	for rows.Next() {
		var item notificationAlert
		var enabledInt int
		if err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.TransportID,
			&item.TransportName,
			&item.MatchQuery,
			&item.Message,
			&enabledInt,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read alerts"})
			return
		}
		item.Enabled = enabledInt == 1
		result = append(result, item)
	}

	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read alerts"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"alerts": result})
}

func (s *server) createNotificationAlert(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireRootAuth(w, r); !ok {
		return
	}

	var payload notificationAlertPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return
	}

	payload, err := validateAlertPayload(payload)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if err := s.ensureTransportExists(r, payload.TransportID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	enabled := true
	if payload.Enabled != nil {
		enabled = *payload.Enabled
	}

	_, execErr := s.stateDB.ExecContext(
		r.Context(),
		`INSERT INTO notification_alerts (name, transport_id, match_query, message, enabled)
		 VALUES (?, ?, ?, ?, ?)`,
		payload.Name,
		payload.TransportID,
		payload.MatchQuery,
		payload.Message,
		boolToInt(enabled),
	)
	if execErr != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create alert"})
		return
	}

	s.listNotificationAlerts(w, r)
}

func (s *server) updateNotificationAlert(w http.ResponseWriter, r *http.Request, alertID int64) {
	if _, ok := s.requireRootAuth(w, r); !ok {
		return
	}

	var existingEnabledInt int
	err := s.stateDB.QueryRowContext(
		r.Context(),
		`SELECT enabled FROM notification_alerts WHERE id = ? LIMIT 1`,
		alertID,
	).Scan(&existingEnabledInt)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "alert not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read alert"})
		return
	}

	var payload notificationAlertPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return
	}

	payload, err = validateAlertPayload(payload)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if err := s.ensureTransportExists(r, payload.TransportID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	enabled := existingEnabledInt == 1
	if payload.Enabled != nil {
		enabled = *payload.Enabled
	}

	result, execErr := s.stateDB.ExecContext(
		r.Context(),
		`UPDATE notification_alerts
		 SET name = ?,
			 transport_id = ?,
			 match_query = ?,
			 message = ?,
			 enabled = ?,
			 updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		payload.Name,
		payload.TransportID,
		payload.MatchQuery,
		payload.Message,
		boolToInt(enabled),
		alertID,
	)
	if execErr != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update alert"})
		return
	}

	rowsAffected, rowsErr := result.RowsAffected()
	if rowsErr != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update alert"})
		return
	}
	if rowsAffected == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "alert not found"})
		return
	}

	s.listNotificationAlerts(w, r)
}

func (s *server) ensureTransportExists(r *http.Request, transportID int64) error {
	var count int
	err := s.stateDB.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM notification_transports WHERE id = ?`, transportID).Scan(&count)
	if err != nil {
		return errors.New("failed to validate transport")
	}
	if count == 0 {
		return errors.New("transport does not exist")
	}
	return nil
}

func (s *server) requireRootAuth(w http.ResponseWriter, r *http.Request) (*user, bool) {
	currentUser, err := s.requireAuth(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return nil, false
	}
	if !currentUser.IsRoot {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only root user can manage notifications"})
		return nil, false
	}
	return currentUser, true
}

func scanNotificationTransport(rows *sql.Rows) (notificationTransport, error) {
	var item notificationTransport
	var configJSON string
	var enabledInt int

	err := rows.Scan(
		&item.ID,
		&item.Name,
		&item.Provider,
		&configJSON,
		&enabledInt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return notificationTransport{}, err
	}

	if item.Provider == notificationProviderDiscordAssistant {
		discordConfig, decodeErr := decodeDiscordConfigFromJSON(configJSON)
		if decodeErr != nil {
			return notificationTransport{}, decodeErr
		}

		item.DestinationType = discordConfig.DestinationType
		if discordConfig.DestinationLabel != "" {
			value := discordConfig.DestinationLabel
			item.DestinationLabel = &value
		}
		if discordConfig.DMUserID != "" {
			value := discordConfig.DMUserID
			item.DMUserID = &value
		}
		if discordConfig.GuildID != "" {
			value := discordConfig.GuildID
			item.GuildID = &value
		}
		if discordConfig.ChannelID != "" {
			value := discordConfig.ChannelID
			item.ChannelID = &value
		}

		if strings.TrimSpace(discordConfig.BotToken) != "" {
			item.HasBotToken = true
			masked := maskToken(discordConfig.BotToken)
			item.BotTokenMasked = &masked
		}
	}

	item.Enabled = enabledInt == 1
	return item, nil
}

func validateTransportPayload(payload notificationTransportPayload) (notificationTransportPayload, error) {
	payload.Name = strings.TrimSpace(payload.Name)
	payload.Provider = strings.TrimSpace(strings.ToLower(payload.Provider))
	if payload.Provider == "" {
		payload.Provider = notificationProviderDiscordAssistant
	}

	if payload.Name == "" {
		return payload, errors.New("name is required")
	}
	if payload.Provider != notificationProviderDiscordAssistant {
		return payload, errors.New("provider must be discord_assistant")
	}

	payload.DestinationType = strings.TrimSpace(strings.ToLower(payload.DestinationType))
	payload.DestinationLabel = strings.TrimSpace(payload.DestinationLabel)
	payload.DMUserID = strings.TrimSpace(payload.DMUserID)
	payload.GuildID = strings.TrimSpace(payload.GuildID)
	payload.ChannelID = strings.TrimSpace(payload.ChannelID)
	payload.BotToken = strings.TrimSpace(payload.BotToken)

	switch payload.DestinationType {
	case destinationTypeDirectMessage:
		if payload.DMUserID == "" {
			return payload, errors.New("dm_user_id is required for direct_message destination")
		}
		payload.GuildID = ""
		payload.ChannelID = ""
	case destinationTypeGuildTextChannel:
		if payload.GuildID == "" || payload.ChannelID == "" {
			return payload, errors.New("guild_id and channel_id are required for guild_text_channel destination")
		}
		payload.DMUserID = ""
	default:
		return payload, errors.New("destination_type must be direct_message or guild_text_channel")
	}

	return payload, nil
}

func decodeDiscordConfigFromJSON(raw string) (discordAssistantTransportConfig, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return discordAssistantTransportConfig{}, nil
	}

	var config discordAssistantTransportConfig
	if err := json.Unmarshal([]byte(trimmed), &config); err != nil {
		return discordAssistantTransportConfig{}, err
	}

	return config, nil
}

func buildTransportConfigJSON(payload notificationTransportPayload) (string, error) {
	switch payload.Provider {
	case notificationProviderDiscordAssistant:
		config := discordAssistantTransportConfig{
			DestinationType:  payload.DestinationType,
			DestinationLabel: strings.TrimSpace(payload.DestinationLabel),
			DMUserID:         strings.TrimSpace(payload.DMUserID),
			GuildID:          strings.TrimSpace(payload.GuildID),
			ChannelID:        strings.TrimSpace(payload.ChannelID),
			BotToken:         strings.TrimSpace(payload.BotToken),
		}

		encoded, err := json.Marshal(config)
		if err != nil {
			return "", errors.New("failed to encode transport config")
		}
		return string(encoded), nil
	default:
		return "", errors.New("unsupported notification provider")
	}
}

func validateAlertPayload(payload notificationAlertPayload) (notificationAlertPayload, error) {
	payload.Name = strings.TrimSpace(payload.Name)
	payload.Message = strings.TrimSpace(payload.Message)

	if payload.Name == "" {
		return payload, errors.New("name is required")
	}
	if payload.TransportID <= 0 {
		return payload, errors.New("transport_id is required")
	}

	normalizedMatchQuery, err := normalizeAlertMatchQuery(payload.MatchQuery)
	if err != nil {
		return payload, err
	}
	payload.MatchQuery = normalizedMatchQuery

	if payload.Message == "" {
		return payload, errors.New("message is required")
	}

	return payload, nil
}

func normalizeAlertMatchQuery(raw string) (string, error) {
	parsed, err := parseAlertMatchQuery(raw)
	if err != nil {
		return "", err
	}

	normalized := map[string]string{}
	if parsed.Service != "" {
		normalized["service"] = parsed.Service
	}
	if parsed.Level != "" {
		normalized["level"] = parsed.Level
	}
	if parsed.ResourceID != "" {
		normalized["resource_id"] = parsed.ResourceID
	}

	if len(normalized) == 0 {
		return "", errors.New("match_query must include at least one filter: service, level or resource_id")
	}

	encoded, marshalErr := json.Marshal(normalized)
	if marshalErr != nil {
		return "", errors.New("failed to normalize match_query")
	}

	return string(encoded), nil
}

func parseAlertMatchQuery(raw string) (alertMatchQuery, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return alertMatchQuery{}, errors.New("match_query is required")
	}

	queryFromJSON, err := parseAlertMatchQueryJSON(trimmed)
	if err != nil {
		return alertMatchQuery{}, errors.New("match_query must be a JSON object with service, level and/or resource_id")
	}

	return queryFromJSON, nil
}

func parseAlertMatchQueryJSON(raw string) (alertMatchQuery, error) {
	var payload struct {
		Service    string `json:"service"`
		Level      string `json:"level"`
		ResourceID string `json:"resource_id"`
	}

	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return alertMatchQuery{}, err
	}

	query := alertMatchQuery{
		Service:    strings.TrimSpace(payload.Service),
		Level:      strings.TrimSpace(payload.Level),
		ResourceID: strings.TrimSpace(payload.ResourceID),
	}

	return query, nil
}

func notificationIDFromPath(path, prefix string) (int64, bool) {
	raw := strings.TrimPrefix(path, prefix)
	raw = strings.Trim(raw, "/")
	if raw == "" {
		return 0, false
	}
	if strings.Contains(raw, "/") {
		return 0, false
	}

	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, false
	}

	return id, true
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func maskToken(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	if len(token) <= 8 {
		return "••••"
	}
	return token[:4] + "••••" + token[len(token)-4:]
}
