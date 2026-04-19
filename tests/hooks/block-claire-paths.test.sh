#!/usr/bin/env bash
# Smoke test: block-claire-paths.sh must exit 2 on .claire paths, exit 0 otherwise.
set -u
HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/block-claire-paths.sh"

fail=0

# Should block (exit 2): any field containing .claire
for payload in \
  '{"tool_name":"Write","tool_input":{"file_path":"/repo/.claire/foo"}}' \
  '{"tool_name":"Edit","tool_input":{"file_path":"/repo/.claire/rules/x.md"}}' \
  '{"tool_name":"Read","tool_input":{"file_path":"/repo/.claire/settings.json"}}'; do
  out=$(echo "$payload" | bash "$HOOK" 2>&1); rc=$?
  if [ "$rc" != "2" ]; then
    echo "expected exit 2 for $payload, got $rc ($out)"; fail=1
  fi
done

# Should allow (exit 0): paths that contain .claude or unrelated text
for payload in \
  '{"tool_name":"Write","tool_input":{"file_path":"/repo/.claude/settings.json"}}' \
  '{"tool_name":"Read","tool_input":{"file_path":"/repo/src/main.ts"}}' \
  '{"tool_name":"Bash","tool_input":{"command":"echo hello"}}'; do
  out=$(echo "$payload" | bash "$HOOK" 2>&1); rc=$?
  if [ "$rc" != "0" ]; then
    echo "expected exit 0 for $payload, got $rc ($out)"; fail=1
  fi
done

exit "$fail"
