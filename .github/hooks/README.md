# GitHub Copilot Hooks

This directory contains hooks that customize GitHub Copilot's behavior when editing code.

## What are Copilot Hooks?

Copilot hooks are shell scripts that run at specific points during Copilot Agent sessions. They allow you to:

- Auto-format code after edits
- Validate changes before they're made
- Log AI activity
- Enforce project standards

Learn more: [GitHub Docs - Using hooks with Copilot agents](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks)

## Active Hooks

### Post-Edit Formatting (`postToolUse`)

**Script:** `scripts/post-edit-format.sh`

Automatically formats files after GitHub Copilot edits them, matching your VS Code formatting settings.

**What it does:**

1. **Go files** in `apps/backend/`
   - Runs `gofmt -w` on edited `.go` files
   - Ensures consistent Go formatting

2. **TypeScript/JavaScript files** in `apps/frontend/`, `apps/desktop/`, `apps/mobile/`
   - Runs `prettier --write` on `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md` files
   - Ensures consistent formatting across all frontend apps

**Triggers on:**

- `replace_string_in_file` - Single file edits
- `multi_replace_string_in_file` - Multi-file edits
- `create_file` - New file creation

**Example:**
When Copilot edits `apps/backend/internal/usecase/user.go`, the hook automatically runs `gofmt` to format it according to Go standards.

## Configuration

The main configuration is in `hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "postToolUse": [
      {
        "type": "command",
        "bash": "./.github/hooks/scripts/post-edit-format.sh",
        "comment": "Auto-format files after Copilot edits them",
        "cwd": ".",
        "timeoutSec": 30
      }
    ]
  }
}
```

## Available Hook Types

GitHub Copilot supports these hook triggers:

- **sessionStart** - When Copilot session begins
- **sessionEnd** - When session ends
- **userPromptSubmitted** - When you submit a prompt
- **preToolUse** - Before Copilot uses a tool (can approve/deny)
- **postToolUse** - After Copilot uses a tool ✅ (currently used)
- **errorOccurred** - When an error happens

## Debugging Hooks

### View Hook Execution

Hooks log to stderr. Look for messages like:

```
[Copilot Hook] Formatting Go file: apps/backend/internal/usecase/user.go
[Copilot Hook] Formatting with Prettier: apps/mobile/src/App.tsx
```

### Test Hook Manually

You can test the hook script directly:

```bash
# Create test input
cat > test-input.json << 'EOF'
{
  "timestamp": 1704614700000,
  "cwd": "/Users/fahmialfareza/Code/timsyaapsyaap/catetin.ai",
  "toolName": "create_file",
  "toolArgs": "{\"filePath\":\"apps/backend/test.go\"}",
  "toolResult": {
    "resultType": "success",
    "textResultForLlm": "File created"
  }
}
EOF

# Run the hook
cat test-input.json | .github/hooks/scripts/post-edit-format.sh
```

### Check if Hook is Running

Temporarily add debug output:

```bash
# Edit post-edit-format.sh
echo "HOOK TRIGGERED: Tool=$TOOL_NAME Result=$RESULT_TYPE" >> /tmp/copilot-hook.log
```

## Troubleshooting

### Hook Not Running

1. **Verify file location**
   - Must be in `.github/hooks/` directory
   - Must be on the default branch (usually `main`)

2. **Check JSON syntax**

   ```bash
   jq . .github/hooks/hooks.json
   ```

3. **Verify script is executable**

   ```bash
   ls -la .github/hooks/scripts/post-edit-format.sh
   # Should show: -rwxr-xr-x
   ```

4. **Check dependencies**
   ```bash
   which gofmt   # Should return a path
   which pnpm    # Should return a path
   which jq      # Should return a path
   ```

### Formatting Not Applied

1. **Check file path patterns**
   - Scripts only format files in specific directories
   - Verify the regex patterns match your file structure

2. **Check tool names**
   - The script watches for `replace_string_in_file`, `multi_replace_string_in_file`, `create_file`
   - Other tool names are ignored

3. **Test formatter manually**

   ```bash
   # Test Go formatting
   gofmt -w apps/backend/internal/usecase/user.go

   # Test Prettier
   pnpm exec prettier --write apps/mobile/src/App.tsx
   ```

### Hook Timing Out

Default timeout is 30 seconds. If formatting takes longer, increase it in `hooks.json`:

```json
{
  "timeoutSec": 60
}
```

## Adding New Hooks

### Example: Log All Prompts

1. Create script:

```bash
#!/bin/bash
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt')
echo "$(date): $PROMPT" >> .github/hooks/logs/prompts.log
```

2. Add to `hooks.json`:

```json
{
  "hooks": {
    "userPromptSubmitted": [
      {
        "type": "command",
        "bash": "./.github/hooks/scripts/log-prompts.sh",
        "cwd": "."
      }
    ]
  }
}
```

### Example: Block Dangerous Commands

```bash
#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName')

if [ "$TOOL_NAME" = "run_in_terminal" ]; then
  COMMAND=$(echo "$INPUT" | jq -r '.toolArgs' | jq -r '.command')

  if echo "$COMMAND" | grep -qE "rm -rf /|sudo rm"; then
    echo '{"permissionDecision":"deny","permissionDecisionReason":"Dangerous command blocked"}'
    exit 0
  fi
fi
```

## Best Practices

1. **Keep hooks fast** - They run synchronously and can slow down Copilot
2. **Use timeouts** - Set appropriate timeouts for long operations
3. **Log to stderr** - stdout is reserved for JSON output
4. **Test independently** - Test scripts manually before adding to hooks
5. **Handle errors gracefully** - Exit 0 on most errors to avoid breaking Copilot
6. **Use `jq` for JSON** - It's the standard tool for parsing JSON in bash

## Resources

- [GitHub Docs - Using Hooks](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks)
- [GitHub Docs - Hooks Configuration](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [GitHub Docs - Copilot CLI Hooks Tutorial](https://docs.github.com/en/copilot/tutorials/copilot-cli-hooks)
