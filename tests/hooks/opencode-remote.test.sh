#!/usr/bin/env bash
# Covers the safety contract for the private OpenCode/Tailscale lifecycle
# script without touching the host's actual OpenCode, Tailscale, or processes.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/opencode-remote.sh"

[ -x "$SCRIPT" ] || {
  echo "opencode-remote.sh is missing or not executable" >&2
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
bin="$tmpdir/bin"
mkdir -p "$bin"
call_log="$tmpdir/calls.log"
state_dir="$tmpdir/state"

cat > "$bin/opencode" <<'EOF'
#!/bin/sh
printf 'opencode %s\n' "$*" >> "$CALL_LOG"
case "$1 ${2:-}" in
  'service get')
    case "$3" in
      hostname) printf '%s\n' 127.0.0.1 ;;
      port) printf '%s\n' 49374 ;;
      mdns) printf '%s\n' false ;;
    esac
    ;;
  'service status') printf '%s\n' running ;;
  'pair ') printf '%s\n' paired ;;
esac
EOF

cat > "$bin/tailscale" <<'EOF'
#!/bin/sh
printf 'tailscale %s\n' "$*" >> "$CALL_LOG"
if [ "$1" = status ]; then
  printf '%s\n' '{"BackendState":"Running","Self":{"DNSName":"mac.example.ts.net."}}'
  exit 0
fi
if [ "$1" = funnel ] && [ "${2:-}" = status ]; then
  printf '%s\n' "${FUNNEL_CONFIG:-{}}"
  exit 0
fi
if [ "$1" = serve ] && [ "${2:-}" = status ]; then
  printf '%s\n' "${SERVE_CONFIG:-{}}"
  exit 0
fi
EOF

cat > "$bin/curl" <<'EOF'
#!/bin/sh
printf '401'
EOF

cat > "$bin/lsof" <<'EOF'
#!/bin/sh
printf '%s\n' "${LISTENER:-opencode 42 user 7u IPv4 0x0 0t0 TCP 127.0.0.1:49374 (LISTEN)}"
EOF

cat > "$bin/caffeinate" <<'EOF'
#!/bin/sh
printf 'caffeinate %s\n' "$*" >> "$CALL_LOG"
sleep 30
EOF

cat > "$bin/gh" <<'EOF'
#!/bin/sh
printf 'gh %s\n' "$*" >> "$CALL_LOG"
exit 0
EOF

cat > "$bin/mise" <<'EOF'
#!/bin/sh
printf 'mise %s\n' "$*" >> "$CALL_LOG"
printf '%s\n' 'mise test'
EOF

cat > "$bin/git" <<'EOF'
#!/bin/sh
printf 'git %s\n' "$*" >> "$CALL_LOG"
case "$1 ${2:-} ${3:-}" in
  'rev-parse --is-inside-work-tree ')
    printf '%s\n' true
    ;;
  'remote get-url origin')
    printf '%s\n' https://github.com/example/repo.git
    ;;
  'config --worktree --get')
    printf '%s\n' .githooks
    ;;
esac
EOF

cat > "$bin/socketfilterfw" <<'EOF'
#!/bin/sh
printf '%s\n' 'Firewall is enabled. (State = 1)'
EOF

chmod +x "$bin"/*

run() {
  PATH="$bin:$PATH" \
    OPENCODE_BIN="$bin/opencode" \
    TAILSCALE_BIN="$bin/tailscale" \
    CURL_BIN="$bin/curl" \
    LSOF_BIN="$bin/lsof" \
    CAFFEINATE_BIN="$bin/caffeinate" \
    GH_BIN="$bin/gh" \
    MISE_BIN="$bin/mise" \
    GIT_BIN="$bin/git" \
    FIREWALL_BIN="$bin/socketfilterfw" \
    OPENCODE_REMOTE_STATE_DIR="$state_dir" \
    CALL_LOG="$call_log" \
    "$SCRIPT" "$@"
}

# An empty shared proxy configuration means neither Serve nor Funnel is
# present, so start may create the single private Serve mapping.
: > "$call_log"
if ! run start > /dev/null; then
  echo "start rejected an empty Tailscale service configuration" >&2
  exit 1
fi
if ! rg -Fq 'tailscale serve --https=443 --bg http://127.0.0.1:49374' "$call_log"; then
  echo "start did not create the expected private Serve mapping:" >&2
  cat "$call_log" >&2
  exit 1
fi
SERVE_CONFIG='{"Web":{"mac.example.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:49374"}}}}}' run stop > /dev/null
rm -rf "$state_dir"

# `status` is diagnostic-only.
: > "$call_log"
run status > /dev/null
if rg -q 'service (set|start|stop)|tailscale serve --https|tailscale down' "$call_log"; then
  echo "status changed service state:" >&2
  cat "$call_log" >&2
  exit 1
fi

# A public Funnel is an absolute stop before any OpenCode reconfiguration.
: > "$call_log"
if FUNNEL_CONFIG='{"AllowFunnel":{"443":true}}' run start > /dev/null 2>&1; then
  echo "start accepted an active Funnel" >&2
  exit 1
fi
if rg -q 'service set|tailscale serve --https' "$call_log"; then
  echo "start changed state after detecting Funnel:" >&2
  cat "$call_log" >&2
  exit 1
fi

# A pre-existing Serve configuration belongs to someone else unless this
# setup recorded ownership, so it must be preserved by refusing to start.
: > "$call_log"
if SERVE_CONFIG='{"TCP":{"443":{"HTTPS":true}}}' run start > /dev/null 2>&1; then
  echo "start accepted unowned Serve configuration" >&2
  exit 1
fi
if rg -q 'tailscale serve --https' "$call_log"; then
  echo "start overwrote unowned Serve configuration:" >&2
  cat "$call_log" >&2
  exit 1
fi

# `ready` must reject a LAN/public listener rather than accepting any running
# OpenCode process.
if LISTENER='opencode 42 user 7u IPv4 0x0 0t0 TCP *:49374 (LISTEN)' run ready > /dev/null 2>&1; then
  echo "ready accepted a non-loopback listener" >&2
  exit 1
fi

# Stopping this setup must never disconnect Tailscale itself.
: > "$call_log"
run stop > /dev/null
if rg -q '^tailscale down' "$call_log"; then
  echo "stop called tailscale down" >&2
  exit 1
fi

echo "all opencode remote lifecycle safety scenarios passed"
