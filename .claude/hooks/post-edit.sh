#!/bin/bash
# Runs an ESLint check after any JS source edit.
# Claude sees the output and can fix errors immediately before continuing.
FILE=$(echo "$CLAUDE_TOOL_INPUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("file_path",""))' 2>/dev/null)

if [[ "$FILE" == *.js || "$FILE" == *.mjs || "$FILE" == *.cjs ]]; then
    # Only lint files under src/ or test/ — skip config and fixtures
    if [[ "$FILE" == *"/src/"* || "$FILE" == *"/test/"* ]]; then
        if [[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/eslint" ]]; then
            echo "→ eslint (triggered by edit to $FILE)"
            "$CLAUDE_PROJECT_DIR/node_modules/.bin/eslint" "$FILE" 2>&1 | head -30
        fi
    fi
fi
