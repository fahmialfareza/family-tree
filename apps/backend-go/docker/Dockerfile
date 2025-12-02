# Multi-stage Dockerfile for backend-go
# Build stage
FROM golang:1.25-alpine AS builder
WORKDIR /src

# Install CA certs
RUN apk add --no-cache ca-certificates git

COPY go.mod go.sum ./
RUN go env -w GOMODCACHE=/go/pkg/mod
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags='-s -w' -o /app/backend ./main.go

# Final stage
FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /app/backend /app/backend

EXPOSE 4000
ENTRYPOINT ["/app/backend"]
