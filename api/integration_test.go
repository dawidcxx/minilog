package main

import (
	"bytes"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

const integrationLogsDBDefaultURL = "postgres://logs:123@localhost/logs"

type integrationTestApp struct {
	ts      *httptest.Server
	stateDB *sql.DB
	logsDB  *sql.DB
}

func TestAPIIntegration(t *testing.T) {
	t.Run("bootstrap returns false on blank install", func(t *testing.T) {
		app := newIntegrationTestApp(t)
		defer app.close()

		client := newCookieClient(t)
		status, body := doJSONRequest(t, client, http.MethodGet, app.ts.URL+"/api/bootstrap", nil)
		if status != http.StatusOK {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusOK, status, string(body))
		}

		var response struct {
			HasUser bool `json:"has_user"`
		}
		decodeJSON(t, body, &response)

		if response.HasUser {
			t.Fatalf("expected has_user=false on blank install")
		}
	})

	t.Run("register then login with bad and good credentials", func(t *testing.T) {
		app := newIntegrationTestApp(t)
		defer app.close()

		rootClient := bootstrapInitialUser(t, app, "root@example.com", "root-secret")

		status, body := doJSONRequest(t, rootClient, http.MethodPost, app.ts.URL+"/api/logout", map[string]any{})
		if status != http.StatusOK {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusOK, status, string(body))
		}

		badClient := newCookieClient(t)
		status, body = doJSONRequest(t, badClient, http.MethodPost, app.ts.URL+"/api/login", map[string]string{
			"email":    "root@example.com",
			"password": "wrong-password",
		})
		if status != http.StatusUnauthorized {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusUnauthorized, status, string(body))
		}

		goodClient := newCookieClient(t)
		status, body = doJSONRequest(t, goodClient, http.MethodPost, app.ts.URL+"/api/login", map[string]string{
			"email":    "root@example.com",
			"password": "root-secret",
		})
		if status != http.StatusOK {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusOK, status, string(body))
		}

		var loginResponse struct {
			User user `json:"user"`
		}
		decodeJSON(t, body, &loginResponse)
		if loginResponse.User.Email != "root@example.com" {
			t.Fatalf("expected logged in user email root@example.com, got %q", loginResponse.User.Email)
		}

		status, body = doJSONRequest(t, goodClient, http.MethodGet, app.ts.URL+"/api/me", nil)
		if status != http.StatusOK {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusOK, status, string(body))
		}
	})

	t.Run("root can invite and invited user can complete registration", func(t *testing.T) {
		app := newIntegrationTestApp(t)
		defer app.close()

		rootClient := bootstrapInitialUser(t, app, "root@example.com", "root-secret")

		status, body := doJSONRequest(t, rootClient, http.MethodPost, app.ts.URL+"/api/users/invite", map[string]string{
			"email": "alice@example.com",
		})
		if status != http.StatusCreated {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusCreated, status, string(body))
		}

		var invitationCreateResponse struct {
			Invitation struct {
				ID   string `json:"id"`
				Link string `json:"link"`
			} `json:"invitation"`
		}
		decodeJSON(t, body, &invitationCreateResponse)
		if strings.TrimSpace(invitationCreateResponse.Invitation.ID) == "" {
			t.Fatalf("expected invitation id to be set")
		}

		invitationID := invitationCreateResponse.Invitation.ID

		status, body = doJSONRequest(t, newCookieClient(t), http.MethodGet, app.ts.URL+"/api/invitations/"+invitationID, nil)
		if status != http.StatusOK {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusOK, status, string(body))
		}

		var invitationReadResponse struct {
			Invitation invitationDetails `json:"invitation"`
		}
		decodeJSON(t, body, &invitationReadResponse)
		if invitationReadResponse.Invitation.Email != "alice@example.com" {
			t.Fatalf("expected invitation email alice@example.com, got %q", invitationReadResponse.Invitation.Email)
		}

		invitedClient := newCookieClient(t)
		status, body = doJSONRequest(t, invitedClient, http.MethodPost, app.ts.URL+"/api/invitations/"+invitationID+"/complete", map[string]string{
			"password": "alice-password",
		})
		if status != http.StatusOK {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusOK, status, string(body))
		}

		status, body = doJSONRequest(t, newCookieClient(t), http.MethodPost, app.ts.URL+"/api/login", map[string]string{
			"email":    "alice@example.com",
			"password": "alice-password",
		})
		if status != http.StatusOK {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusOK, status, string(body))
		}
	})

	t.Run("logs endpoint returns manually inserted postgres logs", func(t *testing.T) {
		app := newIntegrationTestApp(t)
		defer app.close()

		rootClient := bootstrapInitialUser(t, app, "root@example.com", "root-secret")

		serviceName := "it-service-" + randomHex(6)
		hostname := "it-host-" + randomHex(4)
		expectedMessages := insertRandomLogs(t, app.logsDB, serviceName, hostname, 5)
		defer cleanupLogs(t, app.logsDB, serviceName, hostname)

		status, body := doJSONRequest(t, rootClient, http.MethodGet, app.ts.URL+"/api/logs?service="+serviceName+"&limit=20", nil)
		if status != http.StatusOK {
			t.Fatalf("expected %d, got %d, body=%s", http.StatusOK, status, string(body))
		}

		var response struct {
			Logs []serviceLog `json:"logs"`
		}
		decodeJSON(t, body, &response)
		if len(response.Logs) < len(expectedMessages) {
			t.Fatalf("expected at least %d logs, got %d", len(expectedMessages), len(response.Logs))
		}

		found := make(map[string]bool, len(expectedMessages))
		for _, msg := range expectedMessages {
			found[msg] = false
		}

		for _, item := range response.Logs {
			if item.Message != nil {
				if _, ok := found[*item.Message]; ok {
					found[*item.Message] = true
				}
			}
		}

		for msg, ok := range found {
			if !ok {
				t.Fatalf("expected log message %q to be present in /api/logs response", msg)
			}
		}
	})
}

func newIntegrationTestApp(t *testing.T) *integrationTestApp {
	t.Helper()

	logsDBURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if logsDBURL == "" {
		logsDBURL = integrationLogsDBDefaultURL
	}

	logsDB, err := openLogsDB(logsDBURL)
	if err != nil {
		t.Fatalf("open logs DB: %v", err)
	}

	if err := logsDB.Ping(); err != nil {
		t.Fatalf("ping logs DB (%s): %v", logsDBURL, err)
	}

	if err := ensureLogsTable(logsDB); err != nil {
		t.Fatalf("ensure logs table: %v", err)
	}

	stateDBName := fmt.Sprintf("file:minilog_test_%s?mode=memory&cache=shared", randomHex(8))
	stateDB, err := openStateDB(stateDBName)
	if err != nil {
		_ = logsDB.Close()
		t.Fatalf("open state DB: %v", err)
	}
	stateDB.SetMaxOpenConns(1)

	if err := initStateDB(stateDB); err != nil {
		_ = stateDB.Close()
		_ = logsDB.Close()
		t.Fatalf("init state DB: %v", err)
	}

	s := newServer(envConfig{
		stateDBPath:  stateDBName,
		pgURL:        logsDBURL,
		cookieName:   defaultCookieName,
		secureCookie: false,
	}, stateDB, logsDB)

	ts := httptest.NewServer(s.routes())

	return &integrationTestApp{
		ts:      ts,
		stateDB: stateDB,
		logsDB:  logsDB,
	}
}

func (a *integrationTestApp) close() {
	a.ts.Close()
	_ = a.stateDB.Close()
	_ = a.logsDB.Close()
}

func ensureLogsTable(db *sql.DB) error {
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS service_logs (
	timestamp TIMESTAMPTZ NOT NULL,
	hostname TEXT NOT NULL,
	service TEXT NOT NULL,
	level TEXT NOT NULL,
	request_id TEXT,
	resource_id TEXT,
	message TEXT,
	message_json JSONB
)`)
	return err
}

func bootstrapInitialUser(t *testing.T, app *integrationTestApp, email, password string) *http.Client {
	t.Helper()

	client := newCookieClient(t)

	status, body := doJSONRequest(t, client, http.MethodGet, app.ts.URL+"/api/bootstrap", nil)
	if status != http.StatusOK {
		t.Fatalf("expected %d, got %d, body=%s", http.StatusOK, status, string(body))
	}

	var bootstrapResponse struct {
		HasUser bool `json:"has_user"`
	}
	decodeJSON(t, body, &bootstrapResponse)
	if bootstrapResponse.HasUser {
		t.Fatalf("expected has_user=false before bootstrap registration")
	}

	status, body = doJSONRequest(t, client, http.MethodPost, app.ts.URL+"/api/register", map[string]string{
		"email":    email,
		"password": password,
	})
	if status != http.StatusCreated {
		t.Fatalf("expected %d, got %d, body=%s", http.StatusCreated, status, string(body))
	}

	return client
}

func newCookieClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("create cookie jar: %v", err)
	}

	return &http.Client{Jar: jar}
}

func doJSONRequest(t *testing.T, client *http.Client, method, url string, payload any) (int, []byte) {
	t.Helper()

	var bodyReader io.Reader
	if payload != nil {
		buf, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		bodyReader = bytes.NewReader(buf)
	}

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("execute request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}

	return resp.StatusCode, body
}

func decodeJSON(t *testing.T, body []byte, dest any) {
	t.Helper()
	if err := json.Unmarshal(body, dest); err != nil {
		t.Fatalf("decode json (%s): %v", string(body), err)
	}
}

func insertRandomLogs(t *testing.T, db *sql.DB, service, hostname string, count int) []string {
	t.Helper()

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	messages := make([]string, 0, count)

	for i := range count {
		msg := fmt.Sprintf("integration-log-%d-%s", i+1, randomHex(5))
		messages = append(messages, msg)

		payload := fmt.Sprintf(`{"seed":%d,"token":"%s"}`, rng.Intn(100000), randomHex(4))
		timestamp := time.Now().UTC().Add(-time.Duration(i) * time.Second)

		_, err := db.Exec(`
INSERT INTO service_logs (timestamp, hostname, service, level, request_id, resource_id, message, message_json)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
`, timestamp, hostname, service, "INFO", "req-"+randomHex(4), "res-"+randomHex(4), msg, payload)
		if err != nil {
			t.Fatalf("insert log row: %v", err)
		}
	}

	return messages
}

func cleanupLogs(t *testing.T, db *sql.DB, service, hostname string) {
	t.Helper()
	_, err := db.Exec(`DELETE FROM service_logs WHERE service = $1 AND hostname = $2`, service, hostname)
	if err != nil {
		t.Fatalf("cleanup logs: %v", err)
	}
}

func randomHex(byteLen int) string {
	if byteLen <= 0 {
		return ""
	}

	buf := make([]byte, byteLen)
	for i := range buf {
		buf[i] = byte(time.Now().UnixNano() >> (i % 8))
	}

	return hex.EncodeToString(buf)
}
