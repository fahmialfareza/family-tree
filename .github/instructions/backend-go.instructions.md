---
name: "Backend Go coding conventions"
description: "Coding conventions for Go files"
applyTo: "apps/backend/**/*.go"
---

# Copilot Instructions — apps/backend

## Purpose

Guidance for working in the Go backend:

- Gin Gonic framework for HTTP handling.
- MVC architecture and patterns which have `controllers/`, `models/`, and `pkg/`.

## Key points

- Language: Go. Use idiomatic Go patterns (`context.Context`, error handling). Run `gofmt`.
- Structure:
  - `docker` contains Docker-related files and configurations.
  - `internal` contains internal packages not meant for external use.
    - `auth.go` handles authentication logic.
    - `cache.go` manages caching mechanisms.
    - `db.go` manages database connections and queries.
    - `*_controller.go` files define HTTP handlers for different routes.
    - `middleware.go` contains middleware functions for request processing.
    - `models.go` defines data models used across the application.
    - `newrelic.go` integrates New Relic monitoring.
    - `routes.go` sets up the routing for the application.
    - `store.go` manages data storage and retrieval logic.
    - `upload.go` handles file upload functionality.
    - `utils.go` contains utility functions used across the application.
  - `tmp` is for temporary files and should be ignored in version control.
  - `go.mod` and `go.sum` manage dependencies.
  - `main.go` is the entry point of the application.
  - `Readme.md` provides documentation for the backend application.

## Run

- Common tasks: `cd apps/backend` and use existing `bin/` artifacts for reference.
- Alternatively, run with VSCode debugger.

## Style & safety

- Use `gofmt`/`go vet`. Keep handlers thin; move business logic into usecases.

## Examples of good prompts

- "Create an internal cache wrapper under `internal/cache.go`."
