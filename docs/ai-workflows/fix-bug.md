# Fix Bug Template

Use this template when you have a regression, a failing behavior, or a concrete bug to diagnose.

```text
You are working in the Family Tree monorepo.

Before editing:
- Read AGENT_CONTEXT.md.
- Read any matching .github/instructions/*.instructions.md files for the code you touch.
- If this work comes from a task spec under .github/tasks/, update its checklist as items are completed.

Bug
Fix: <short bug summary>

Evidence
- App: <apps/backend-go | apps/frontend | apps/backend>
- Failing file, route, or component: <path or symbol>
- Error message or broken behavior: <exact message or observed result>
- Expected behavior: <what should happen instead>
- Reproduction steps: <short numbered steps>

Constraints
- Start from the concrete failing anchor.
- Fix the root cause, not a surface workaround, if the local code path is clear.
- Keep the change narrow.
- Do not refactor unrelated areas.

Validation
- Run the cheapest focused check that can disconfirm the fix.
- If no automated check exists, explain the manual verification steps you used.

Deliverables
- Fix the bug.
- Explain the root cause briefly.
- Summarize changed files, validation, and any remaining risk.
```
