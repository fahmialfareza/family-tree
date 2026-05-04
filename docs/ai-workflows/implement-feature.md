# Implement Feature Template

Use this template when you want an assistant to add a scoped feature without drifting across the repo.

```text
You are working in the Family Tree monorepo.

Before editing:
- Read AGENT_CONTEXT.md.
- Read any matching .github/instructions/*.instructions.md files for the code you touch.
- If this work comes from a task spec under .github/tasks/, update its checklist as items are completed.

Task
Implement: <clear feature summary>

Target Area
- App: <apps/backend-go | apps/frontend | apps/backend>
- Main file or folder: <path>
- Concrete anchor: <file, symbol, route, component, store, or endpoint>
- Expected behavior: <what should work when this is done>

Constraints
- Keep changes minimal and localized.
- Reuse existing patterns before creating new abstractions.
- Do not add new dependencies unless necessary.
- Preserve API shapes and UI behavior outside this feature.
- Avoid new feature work in apps/backend unless this task explicitly targets the legacy backend.

Validation
- Run the narrowest useful validation command for the touched area.
- If there is no automated test for this slice, include manual verification steps.

Deliverables
- Implement the feature.
- Update nearby docs only if they are affected.
- Summarize changed files, validation, and any assumptions.
```
