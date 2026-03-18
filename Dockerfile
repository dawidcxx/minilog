# ---------- frontend build ----------
FROM oven/bun:1-alpine AS fe-builder
WORKDIR /app/frontend
COPY frontend/package*.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend .
RUN bun run build

# ---------- go build ----------
FROM golang:1.25-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY api ./api
RUN CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags="-s -w" -o minilog ./api


# ---------- final image ----------
FROM alpine:3.19
WORKDIR /app
COPY --from=go-builder /app/minilog .
COPY --from=fe-builder /app/frontend/dist ./frontend/dist

EXPOSE 8080

CMD ["./minilog"]