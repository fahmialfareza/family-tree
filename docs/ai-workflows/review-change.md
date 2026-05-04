# Review Change Template

Use this template when you want an assistant to review a diff, branch, or pull request with a bug and regression focus.

```text
Review this change in the Family Tree monorepo.

Before reviewing:
- Read AGENT_CONTEXT.md.
- Read any matching .github/instructions/*.instructions.md files for the touched code.

Review Target
- App: <apps/backend-go | apps/frontend | apps/backend | mixed>
- Change surface: <branch, diff summary, PR link, or file list>
- Focus area: <optional: API compatibility, UI regressions, performance, data integrity, auth, etc.>

Review Rules
- Prioritize bugs, behavioral regressions, missing validation, and risky assumptions.
- Keep findings ordered by severity.
- Include concrete file references when possible.
- Keep summaries brief and secondary to findings.
- If no issues are found, say so explicitly and mention any residual risks or validation gaps.

Output Format
- Findings first.
- Then open questions or assumptions.
- Then a short change summary only if it adds value.
```
