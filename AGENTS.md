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

IMPORTANT: Always run checks after non-trivial edits.
