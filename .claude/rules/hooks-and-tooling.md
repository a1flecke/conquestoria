---
paths:
  - ".claude/**"
  - "tests/hooks/**"
---

# Hooks And Tooling

## PreToolUse / PostToolUse hooks read JSON from stdin
- Claude Code hooks do NOT receive `CLAUDE_TOOL_INPUT` or any other env var holding the tool input.
- Tool input arrives as JSON on stdin. Parse it with `jq`:
  - `jq -r '.tool_name'` for the tool name
  - `jq -r '.tool_input.file_path // empty'` for Write/Edit/Read paths
  - `jq -r '.tool_input.command // empty'` for Bash commands
- Read stdin exactly once into a variable, then query that variable with `jq`:
  ```bash
  INPUT=$(cat)
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  ```
- Source: https://code.claude.com/docs/en/hooks

## Hook exit codes
- `0` — allow the tool call (proceed). stdout JSON may control the call further.
- `2` — block the tool call. stderr is fed back to Claude as the reason.
- Any other code — non-blocking error; Claude proceeds, stderr surfaces in the transcript.

## Every new hook script needs a smoke test
- When you add a hook script under `.claude/hooks/`, add a matching smoke test under `tests/hooks/<name>.test.sh` that:
  1. pipes a representative blocking input as JSON via stdin and asserts exit code 2,
  2. pipes a representative passing input and asserts exit code 0,
  3. is wired into `yarn test` (or a top-level `bash tests/hooks/run.sh` invoked by CI/lint).
- Without a smoke test, a non-functional hook (e.g. wrong env var, wrong jq path) will silently no-op forever and erode trust in the safety system.

## Hook authorship checklist (apply before merging any new hook)
- [ ] Reads stdin via `cat` exactly once
- [ ] Uses `jq -r '.tool_input.<field> // empty'` for every field it queries
- [ ] Returns exit 2 on the deny path with a clear stderr message
- [ ] Has matching `tests/hooks/<name>.test.sh` covering pass and block paths
- [ ] Registered in `.claude/settings.json` under the correct `matcher` for the tool it cares about
