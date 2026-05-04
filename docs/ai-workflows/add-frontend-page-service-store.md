# Add Frontend Page + Service + Store Template

Use this template when you want an assistant to add a page flow in `apps/frontend` with App Router UI, service logic, and Zustand state where needed.

```text
You are working in the Family Tree monorepo.

Before editing:
- Read AGENT_CONTEXT.md.
- Read .github/instructions/frontend.instructions.md.
- If this work comes from a task spec under .github/tasks/, update its checklist as items are completed.

Task
Add or update a frontend page flow in apps/frontend.

Target Flow
- Route or screen: <src/app/...>
- Main anchor: <page.tsx, component, service file, or store file>
- UI goal: <what the page should let the user do>
- Data source: <API endpoint or local state>
- Service layer path: <src/service/...>
- Zustand path if shared state is needed: <src/zustand/...>
- Models or types touched: <src/models/...>

Implementation Expectations
- Follow the existing Next.js App Router structure under `src/app/`.
- Put API calls and request shaping in `src/service/` instead of directly inside page components when the flow is non-trivial.
- Use `src/zustand/` only when state needs to be shared across components, persisted across steps, or reused across routes.
- Keep the UI aligned with existing project patterns and avoid adding new dependencies unless necessary.
- Preserve existing behavior outside the target flow.

Validation
- Run the narrowest useful frontend check, usually `pnpm --filter frontend lint`.
- If needed, also run `pnpm --filter frontend build`.
- Include short manual verification steps for the route and user interaction.

Deliverables
- Implement the route, service, and store changes needed for the flow.
- Summarize the touched files and data flow.
- Call out any assumptions about API responses, navigation, or shared state.
```
