## Status

MVP implemented.


# Minilog 

Temu grafana. Ready for the brave new AI era (of atrocious RAM prices)

# Why consider minilog ?

- You actually pay for your servers 

- You don't like writing long yaml config files

- You like using postgres for everything

# How it works / requirements

1. Store your logs in using TimescaleDB (postgres extension)
2. Find some way to push logs into DB, I recommend [vector](https://vector.dev/) 
3. Spin up minilog to display logs & setup alerts 

## What is implemented in this iteration

- Go API with:
	- first-run bootstrap detection
	- single-user registration flow
	- login/logout with httpOnly cookie sessions
	- SQLite app state storage (`users`, `sessions`)
	- protected logs endpoint backed by PostgreSQL `service_logs`
- Preact dashboard with:
	- registration page when no user exists
	- login page after first registration
	- authenticated logs table with filters (`service`, `level`, `q`, `limit`)

## Environment variables

- `DATABASE_URL` (PostgreSQL connection string)
- `MINILOG_STATE_DB` (path to SQLite file, default `./minilog_state.db`)

## Run locally

1. API server:
	 - from project root: `go run ./api`
2. Frontend dev server:
	 - from `frontend/`: `bun install && bun run dev`

Frontend dev server proxies `/api` requests to `http://localhost:8080`.