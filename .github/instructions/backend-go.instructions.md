---
name: "Backend Go coding conventions"
description: "Coding conventions for Go files in apps/backend-go"
applyTo: "apps/backend-go/**/*.go"
---

# Copilot Instructions — apps/backend-go

## Purpose

Guidance for working in the primary Go backend.

## Key points

- Language: Go. Use idiomatic Go patterns, including explicit error handling and `context.Context` where the surrounding code already uses it.
- Structure:
  - `internal/` contains the application packages and request handling logic.
  - `*_controller.go` files handle routes and should stay thin.
  - Shared logic should be reused through the existing `internal/` packages rather than duplicated in handlers.
  - `main.go` is the entry point.

## Run

- Build: `cd apps/backend-go && go build ./...`
- Dev: `cd apps/backend-go && go run ./main.go`

## Style & safety

- Run `gofmt` and prefer the narrowest useful validation command.
- Keep handlers thin and push reusable behavior into the existing `internal/` packages.
- Avoid creating parallel layers when an `internal/` package already owns the behavior.

## Examples of good prompts

- "Create an internal cache wrapper under `internal/cache.go`."
