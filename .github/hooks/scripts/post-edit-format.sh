#!/bin/bash
# Post-edit formatting hook for GitHub Copilot
# Auto-formats files after Copilot edits them

# Read JSON input from stdin
INPUT=$(cat)

# Extract tool information
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName')
RESULT_TYPE=$(echo "$INPUT" | jq -r '.toolResult.resultType')

# Only process successful edit/create operations
if [ "$RESULT_TYPE" != "success" ]; then
  exit 0
fi

# Only process file edits and creations
if [ "$TOOL_NAME" != "replace_string_in_file" ] && \
   [ "$TOOL_NAME" != "multi_replace_string_in_file" ] && \
   [ "$TOOL_NAME" != "create_file" ]; then
  exit 0
fi

# Extract file path(s) from toolArgs
TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs')

# Function to format a single file
format_file() {
  local FILE_PATH="$1"
  
  # Skip if file doesn't exist
  if [ ! -f "$FILE_PATH" ]; then
    return
  fi
  
  # Get absolute path
  ABS_PATH=$(realpath "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")
  
  # Format Go files in apps/backend
  if echo "$ABS_PATH" | grep -q "apps/backend/.*\.go$"; then
    echo "[Copilot Hook] Formatting Go file: $FILE_PATH" >&2
    gofmt -w "$FILE_PATH" 2>/dev/null
    return
  fi
  
  # Format TypeScript/JavaScript files in apps/frontend, apps/desktop, apps/mobile
  if echo "$ABS_PATH" | grep -qE "apps/(frontend|desktop|mobile)/.*\.(ts|tsx|js|jsx|json|md)$"; then
    echo "[Copilot Hook] Formatting with Prettier: $FILE_PATH" >&2
    pnpm exec prettier --write "$FILE_PATH" 2>/dev/null
    return
  fi
}

# Handle multi_replace_string_in_file (multiple files)
if [ "$TOOL_NAME" = "multi_replace_string_in_file" ]; then
  # Extract all file paths from replacements array
  FILE_PATHS=$(echo "$TOOL_ARGS" | jq -r '.replacements[]?.filePath' 2>/dev/null)
  
  while IFS= read -r FILE_PATH; do
    if [ -n "$FILE_PATH" ] && [ "$FILE_PATH" != "null" ]; then
      format_file "$FILE_PATH"
    fi
  done <<< "$FILE_PATHS"
  
  exit 0
fi

# Handle replace_string_in_file and create_file (single file)
FILE_PATH=$(echo "$TOOL_ARGS" | jq -r '.filePath' 2>/dev/null)

if [ -n "$FILE_PATH" ] && [ "$FILE_PATH" != "null" ]; then
  format_file "$FILE_PATH"
fi

exit 0
