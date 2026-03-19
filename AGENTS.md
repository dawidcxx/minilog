# AGENTS.md

Basic guidance for AI/code agents working in this repository.

## 1) Project overview

Minilog is a lightweight logs dashboard:

- Backend: Go API in `api/`
- Frontend: React + TypeScript + Vite in `frontend/`
- IMPORTANT: uses `bun` inplace of `node` and `npm` 

## 2) Useful commands

- `test-api` → run backend tests
- `run-checks` → backend tests + frontend typecheck
- `sqlite3` → manipulate sqlite local DB 

IMPORTANT: Always run checks after non-trivial edits.

## 3) Other information

- Backend application state is stored in `minilog_state.db`, which is a SQLite database
- The backend also connects to a remote timescaleDB (postgres) to retrieve logs, which are the main subject of the application
- Example schema of expected TimescaleDB is in `contrib/init.sql`
- You are free trash / introspect the local state DB. For example `sqlite3 ./storage/minilog_state.db "SELECT datetime('now');"`
