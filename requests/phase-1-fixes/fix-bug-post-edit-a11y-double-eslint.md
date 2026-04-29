# fix-bug: `post-edit-a11y.sh` runs eslint twice; first call is dead work

## What's wrong
`scripts/hooks/post-edit-a11y.sh:14–18`:

```bash
OUTPUT=$(pnpm exec eslint --rulesdir .eslintrc.a11y.cjs --no-eslintrc --rule "{}" \
           --plugin jsx-a11y --ext .tsx,.jsx "$FILE" 2>&1 || true)
# Use the project's actual eslint config — the line above is a fallback.
OUTPUT=$(pnpm exec eslint "$FILE" 2>&1 || true)
```

The first `OUTPUT=$(...)` is overwritten on the next line. It runs eslint with `--no-eslintrc` (override the project config) plus a wrong `--rulesdir` value (the flag wants a directory of rule definitions, not a config file). Net effect: one extra cold-start eslint invocation per saved JSX/TSX file (~1–2s), with no influence on the result.

## Why it matters
- The hook fires on every Write/Edit of a JSX/TSX file. A typical session does many of these. Time matters when you're in flow.
- A reader of the script gets confused about which eslint config is the source of truth.

## Proposed fix
Delete the first invocation. Keep the project-config call only.

```bash
*.tsx|*.jsx)
  if command -v pnpm >/dev/null 2>&1 && [ -f "package.json" ] && grep -q "eslint" package.json 2>/dev/null; then
    OUTPUT=$(pnpm exec eslint "$FILE" 2>&1 || true)
    if echo "$OUTPUT" | grep -qE "(jsx-a11y|axe)" 2>/dev/null; then
      echo "⚠️  a11y lint flagged issues in $FILE — fix before commit:"
      echo "$OUTPUT" | grep -E "(jsx-a11y|axe|warning|error)" | head -20
    fi
  fi
  ;;
```

## Files to touch
- `scripts/hooks/post-edit-a11y.sh`

## Acceptance criteria
- [ ] Only one `pnpm exec eslint` invocation per file.
- [ ] The hook still flags jsx-a11y issues from the project config.
- [ ] No change to behavior on non-JSX/TSX files.
