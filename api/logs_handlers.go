package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

func (s *server) handleLogs(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	_, err := s.requireAuth(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	limit, err := parseLimit(r.URL.Query().Get("limit"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	serviceFilter := strings.TrimSpace(r.URL.Query().Get("service"))
	levelFilter := strings.TrimSpace(r.URL.Query().Get("level"))
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	const logsQuery = `
SELECT timestamp, hostname, service, level, request_id, resource_id, message, message_json
FROM service_logs
WHERE ($1 = '' OR service = $1)
  AND ($2 = '' OR level = $2)
  AND ($3 = '' OR message ILIKE '%' || $3 || '%')
ORDER BY timestamp DESC
LIMIT $4`

	rows, err := s.logsDB.QueryContext(r.Context(), logsQuery, serviceFilter, levelFilter, q, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to query logs"})
		return
	}
	defer rows.Close()

	logs := make([]serviceLog, 0, limit)
	for rows.Next() {
		var item serviceLog
		var msgJSON []byte

		if err := rows.Scan(&item.Timestamp, &item.Hostname, &item.Service, &item.Level, &item.RequestID, &item.ResourceID, &item.Message, &msgJSON); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to parse logs"})
			return
		}

		if len(msgJSON) > 0 {
			item.MessageJSON = json.RawMessage(msgJSON)
		}

		logs = append(logs, item)
	}

	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed while reading logs"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"logs": logs})
}
