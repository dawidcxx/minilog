package main

import (
	"encoding/json"
	"net/http"
	"sort"
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
	requestIDFilter := strings.TrimSpace(r.URL.Query().Get("request_id"))
	resourceIDFilter := strings.TrimSpace(r.URL.Query().Get("resource_id"))

	const logsQuery = `
SELECT timestamp, hostname, service, level, request_id, resource_id, message, message_json
FROM service_logs
WHERE ($1 = '' OR service = $1)
  AND ($2 = '' OR level = $2)
	AND ($3 = '' OR request_id = $3)
	AND ($4 = '' OR resource_id = $4)
ORDER BY timestamp DESC
LIMIT $5`

	rows, err := s.logsDB.QueryContext(r.Context(), logsQuery, serviceFilter, levelFilter, requestIDFilter, resourceIDFilter, limit)
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

func (s *server) handleLogFilterValues(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	_, err := s.requireAuth(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	const serviceValuesQuery = `
SELECT service
FROM (
	SELECT DISTINCT ON (service) service, timestamp AS latest_ts
	FROM service_logs
	ORDER BY service, timestamp DESC
) AS service_latest
ORDER BY service ASC
LIMIT 500`

	const levelValuesQuery = `
SELECT level
FROM (
	SELECT DISTINCT ON (level) level, timestamp AS latest_ts
	FROM service_logs
	ORDER BY level, timestamp DESC
) AS level_latest
ORDER BY level ASC
LIMIT 100`

	rows, err := s.logsDB.QueryContext(r.Context(), serviceValuesQuery)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to query filter values"})
		return
	}
	defer rows.Close()

	services := make([]string, 0, 64)
	for rows.Next() {
		var service string
		if err := rows.Scan(&service); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to parse filter values"})
			return
		}
		service = strings.TrimSpace(service)
		if service == "" {
			continue
		}
		services = append(services, service)
	}

	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed while reading filter values"})
		return
	}

	levelRows, err := s.logsDB.QueryContext(r.Context(), levelValuesQuery)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to query level filter values"})
		return
	}
	defer levelRows.Close()

	levels := make([]string, 0, 16)
	for levelRows.Next() {
		var level string
		if err := levelRows.Scan(&level); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to parse level filter values"})
			return
		}
		level = strings.TrimSpace(level)
		if level == "" {
			continue
		}
		levels = append(levels, level)
	}

	if err := levelRows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed while reading level filter values"})
		return
	}

	sort.Strings(services)
	sort.Strings(levels)

	writeJSON(w, http.StatusOK, map[string]any{
		"service": services,
		"level":   levels,
	})
}
