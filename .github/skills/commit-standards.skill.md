---
description: Conventional commit message standards for Family Tree repository. USE FOR: writing commit messages, PR titles, generating changelogs, maintaining git history. Enforces semantic versioning-friendly commit format.
---

# Commit Message Standards

This skill defines commit message conventions for the Family Tree monorepo.

## Format

All commit messages MUST follow the Conventional Commits specification:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Structure Rules

- **Type**: Required, lowercase
- **Scope**: Optional, lowercase, in parentheses
- **Subject**: Required, lowercase, no period at the end, max 72 characters
- **Body**: Optional, wrap at 72 characters
- **Footer**: Optional, for breaking changes or issue references

## Types

### Primary Types (Use These Most Often)

- **feat**: A new feature

  ```
  feat(backend): implement user authentication with Firebase
  ```

- **fix**: A bug fix

  ```
  fix(backend): correct timezone handling in weekly trends
  ```

- **chore**: Routine tasks, maintenance, dependencies

  ```
  chore(backend): update Go dependencies
  chore: update pnpm to v8
  ```

- **docs**: Documentation only changes

  ```
  docs(readme): add installation instructions
  docs(backend): update API documentation
  ```

- **refactor**: Code change that neither fixes a bug nor adds a feature

  ```
  refactor(backend): simplify user repository interface
  ```

- **style**: Code style changes (formatting, missing semicolons, etc.)

  ```
  style(frontend): fix linting errors
  style: format all TypeScript files with Prettier
  ```

- **perf**: Performance improvements

  ```
  perf(backend): optimize database queries for user notes
  ```

- **test**: Adding or updating tests
  ```
  test(backend): add unit tests for user usecase
  ```

### Secondary Types

- **build**: Changes to build system or dependencies

  ```
  build: configure Turbo cache
  ```

- **ci**: Changes to CI/CD configuration

  ```
  ci: add staging deployment workflow
  ci(backend): add New Relic monitoring to production
  ```

## Scopes

Scopes indicate which part of the monorepo is affected:

### App Scopes

- `backend` - Go backend service
- `frontend` - Next.js frontend app
- `server` - [Deprecated] Express.js server app

### Feature/Domain Scopes

- `auth` - Authentication related
- `notes` - Note management
- `transactions` - Transaction features
- `insights` - Insights and analytics
- `notifications` - Notification system
- `sync` - Data synchronization
- `ui` - User interface components
- `api` - API endpoints
- `database` - Database changes
- `cache` - Caching logic
- `i18n` - Internationalization

### Infrastructure Scopes

- `deps` - Dependencies
- `config` - Configuration files
- `ci` - CI/CD
- `docker` - Docker related
- `dapr` - DAPR configuration

### Examples with Scopes

```
feat(mobile/transactions): add bulk transaction import
fix(backend/auth): correct Firebase token validation
chore(deps): update all pnpm dependencies
refactor(backend/database): migrate to connection pooling
```

## Subject

The subject contains a succinct description of the change:

### Rules

- Use imperative, present tense: "add" not "added" or "adds"
- Don't capitalize the first letter
- No period (.) at the end
- Maximum 72 characters

### Good Examples

```
add user profile page
fix crash when deleting transaction
remove deprecated AI API endpoints
update transaction list UI
```

### Bad Examples

```
Added user profile page          # Past tense
Fix crash.                        # Capitalized, has period
Fixes crash when user deletes...  # Wrong tense
updated the transaction UI        # "the" is unnecessary
```

## Body

The body provides additional context:

### When to Include Body

- Explain WHY you made the change
- Describe WHAT changed at a high level
- Include side effects or consequences
- List migration steps if needed

### Format

- Wrap at 72 characters
- Separate from subject with blank line
- Use bullet points for multiple items

### Example

```
feat(backend): implement spending threshold alerts

Add real-time spending threshold monitoring using DAPR pub/sub.
When a user exceeds their configured threshold, we:
- Send in-app notification
- Trigger email via SendGrid
- Log event to New Relic

This replaces the previous polling-based approach which had
5-minute delays.
```

## Footer

The footer contains metadata:

### Breaking Changes

```
feat(backend): redesign GraphQL schema

BREAKING CHANGE: User query now requires authentication token.
Migration guide: https://docs.catetin.ai/migration/v2
```

### Bug Fix

```
fix(backend): correct weekly trend date calculation

The weekly trend was using server timezone instead of user's
timezone, causing incorrect date groupings for users in
different time zones.

Now properly converts to user's timezone before grouping.

Fixes #234
```

### Breaking Change

```
feat(backend): migrate to GraphQL subscriptions

Replace SSE (Server-Sent Events) with GraphQL subscriptions
for real-time updates. This provides better type safety and
integrates cleanly with existing GraphQL schema.

BREAKING CHANGE:
- SSE endpoint `/events` removed
- Clients must use GraphQL subscription `noteUpdates`
- Migration guide: docs/migrations/graphql-subscriptions.md

Closes #567
```

### Chore

```
chore(deps): update dependencies

- Go dependencies (security patches)
- React Native 0.73 -> 0.74
- Expo SDK 50 -> 51

All tests passing, no breaking changes detected.
```

## Monorepo Commit Strategies

### Single App Changes

When only one app is affected:

```
fix(backend): resolve memory leak in cache
```

### Cross-Cutting Changes

For changes affecting multiple apps equally:

```
chore: update TypeScript to v5.3 across all apps
docs: update README with new setup instructions
```

## PR Title Convention

Pull request titles should follow the same format:

```
fix(backend): correct GraphQL resolver error handling
```

This makes it easy to generate changelogs from merged PRs.

## Tools Integration

### Commitlint

The repository uses commitlint to enforce these rules:

```bash
# Install
pnpm add -D @commitlint/cli @commitlint/config-conventional

# Configuration in .commitlintrc.json
```

### Husky

Git hooks validate commit messages before commit:

```bash
# Pre-commit hook runs linting
# Commit-msg hook validates format
```

## Changelog Generation

Following these conventions allows automatic changelog generation:

```markdown
## [2.0.0] - 2026-03-10

### Features

- (backend): implement GraphQL subscriptions

### Bug Fixes

- (backend): correct weekly trend date calculation

### BREAKING CHANGES

- (backend): GraphQL subscriptions replace SSE endpoint
```

## Tips

### DO ✅

- Keep commits focused on one logical change
- Use present tense imperatives
- Reference issue numbers
- Explain complex changes in the body
- Use conventional types consistently

### DON'T ❌

- Mix multiple unrelated changes in one commit
- Use vague subjects like "fix stuff" or "update"
- Include file names in subject (that's what git log shows)
- Write commit messages that are longer than the code change
- Use past tense ("fixed", "added")

## Quick Reference

```
# Feature
feat(scope): add new feature

# Bug fix
fix(scope): resolve specific issue

# Chore (deps, config, etc.)
chore(scope): update dependencies

# Documentation
docs(scope): update API documentation

# Refactor
refactor(scope): simplify user service

# Performance
perf(scope): optimize database queries

# Tests
test(scope): add unit tests

# Breaking change
feat(scope): change API

BREAKING CHANGE: description of breaking change
```

## Enforcement

These rules are enforced via:

1. **Husky** - Pre-commit and commit-msg hooks
2. **Commitlint** - Validates commit message format
3. **CI** - Rejects PRs with invalid commit messages
4. **Code Review** - Reviewers check for compliance

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Git Commit Best Practices](https://chris.beams.io/posts/git-commit/)
