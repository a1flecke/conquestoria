#!/bin/sh

# Securely expose OpenCode Desktop to this user's Tailscale tailnet. The
# backend stays on loopback; Tailscale Serve supplies the private HTTPS edge.

set -eu

PORT="${OPENCODE_REMOTE_PORT:-49374}"
HOST="127.0.0.1"
STATE_DIR="${OPENCODE_REMOTE_STATE_DIR:-$HOME/Library/Application Support/Conquestoria/OpenCode Remote}"
SERVE_OWNERSHIP_FILE="$STATE_DIR/serve-owned"
CAFFEINATE_PID_FILE="$STATE_DIR/caffeinate.pid"
TAILSCALE_BIN="${TAILSCALE_BIN:-$(command -v tailscale 2>/dev/null || true)}"
CURL_BIN="${CURL_BIN:-$(command -v curl 2>/dev/null || true)}"
LSOF_BIN="${LSOF_BIN:-$(command -v lsof 2>/dev/null || true)}"
CAFFEINATE_BIN="${CAFFEINATE_BIN:-/usr/bin/caffeinate}"
GH_BIN="${GH_BIN:-$(command -v gh 2>/dev/null || true)}"
MISE_BIN="${MISE_BIN:-$(command -v mise 2>/dev/null || true)}"
FIREWALL_BIN="${FIREWALL_BIN:-/usr/libexec/ApplicationFirewall/socketfilterfw}"
PS_BIN="${PS_BIN:-$(command -v ps 2>/dev/null || true)}"
GIT_BIN="${GIT_BIN:-$(command -v git 2>/dev/null || true)}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  return 1
}

find_opencode() {
  if [ -n "${OPENCODE_BIN:-}" ] && [ -x "$OPENCODE_BIN" ]; then
    printf '%s\n' "$OPENCODE_BIN"
    return 0
  fi

  if command -v opencode >/dev/null 2>&1; then
    command -v opencode
    return 0
  fi

  for candidate in "$HOME"/Library/Application\ Support/ai.opencode.desktop/cli/*/opencode-cli; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  fail 'OpenCode CLI not found. Install or open OpenCode Desktop first.'
}

OPENCODE_BIN="${OPENCODE_BIN:-$(find_opencode)}"

require_executable() {
  name="$1"
  path="$2"
  [ -n "$path" ] && [ -x "$path" ] || fail "$name is unavailable."
}

compact_json() {
  tr -d '[:space:]'
}

json_is_empty() {
  value="$(printf '%s' "$1" | compact_json)"
  [ -z "$value" ] || [ "$value" = '{}' ] || [ "$value" = 'null' ]
}

tailscale_status_json() {
  "$TAILSCALE_BIN" status --json
}

tailscale_is_connected() {
  status="$(tailscale_status_json 2>/dev/null || true)"
  printf '%s' "$status" | grep -Eq '"BackendState"[[:space:]]*:[[:space:]]*"Running"' ||
    fail 'Tailscale is not connected. Open Tailscale and wait for Connected.'
}

magic_dns_name() {
  status="$(tailscale_status_json)"
  name="$(printf '%s\n' "$status" | sed -n 's/.*"DNSName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  name="${name%.}"
  [ -n "$name" ] || fail 'MagicDNS name unavailable. Enable MagicDNS in the tailnet first.'
  printf '%s\n' "$name"
}

funnel_is_disabled() {
  config="$("$TAILSCALE_BIN" funnel status --json 2>&1 || true)"
  # Serve and Funnel both report the node's shared proxy configuration. A
  # private Serve route therefore appears in `tailscale funnel status` too;
  # Funnel is present only when the configuration grants `AllowFunnel`.
  if printf '%s' "$config" | grep -Eq '"AllowFunnel"[[:space:]]*:[[:space:]]*(true|\{)'; then
    fail 'Tailscale Funnel is configured. Remove the public Funnel before starting remote OpenCode.'
  fi
}

serve_config() {
  "$TAILSCALE_BIN" serve status --json 2>&1 || true
}

serve_matches_opencode() {
  config="$1"
  printf '%s' "$config" | grep -Fq "127.0.0.1:$PORT"
}

serve_is_owned() {
  [ -f "$SERVE_OWNERSHIP_FILE" ] &&
    grep -Fqx "https=443 backend=http://$HOST:$PORT" "$SERVE_OWNERSHIP_FILE"
}

check_serve_safety_before_start() {
  config="$(serve_config)"
  if json_is_empty "$config"; then
    return 0
  fi

  if serve_is_owned && serve_matches_opencode "$config"; then
    return 0
  fi

  fail 'An existing Tailscale Serve configuration is not owned by this setup; refusing to overwrite it.'
}

configure_opencode_service() {
  "$OPENCODE_BIN" service set hostname "$HOST"
  "$OPENCODE_BIN" service set port "$PORT"
  "$OPENCODE_BIN" service start
}

service_is_configured_private() {
  hostname="$("$OPENCODE_BIN" service get hostname 2>/dev/null || true)"
  port="$("$OPENCODE_BIN" service get port 2>/dev/null || true)"
  [ "$hostname" = "$HOST" ] || return 1
  [ "$port" = "$PORT" ] || return 1
}

service_is_running() {
  output="$("$OPENCODE_BIN" service status 2>&1 || true)"
  case "$output" in
    "http://$HOST:$PORT"|*'running'*|*'active'*|*'started'*) return 0 ;;
    *) return 1 ;;
  esac
}

listener_is_loopback_only() {
  listeners="$("$LSOF_BIN" -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep 'TCP' || true)"
  [ -n "$listeners" ] || return 1
  printf '%s\n' "$listeners" | grep -Fq "127.0.0.1:$PORT" || return 1
  if printf '%s\n' "$listeners" | grep -Fv "127.0.0.1:$PORT" | grep -q '.'; then
    return 1
  fi
}

local_http_responds() {
  code="$("$CURL_BIN" --max-time 5 -sS -o /dev/null -w '%{http_code}' "http://$HOST:$PORT/" 2>/dev/null || true)"
  case "$code" in
    200|401|403) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_serve() {
  config="$(serve_config)"
  if ! json_is_empty "$config"; then
    if serve_is_owned && serve_matches_opencode "$config"; then
      return 0
    fi
    fail 'An existing Tailscale Serve configuration is not owned by this setup; refusing to overwrite it.'
  fi

  "$TAILSCALE_BIN" serve --https=443 --bg "http://$HOST:$PORT"
  mkdir -p "$STATE_DIR"
  printf 'https=443 backend=http://%s:%s\n' "$HOST" "$PORT" > "$SERVE_OWNERSHIP_FILE"
}

owned_caffeinate_is_running() {
  [ -f "$CAFFEINATE_PID_FILE" ] || return 1
  pid="$(cat "$CAFFEINATE_PID_FILE" 2>/dev/null || true)"
  case "$pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  kill -0 "$pid" 2>/dev/null || return 1
  [ -n "$PS_BIN" ] || return 1
  command="$("$PS_BIN" -p "$pid" -o command= 2>/dev/null || true)"
  case "$command" in
    *caffeinate*) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_caffeinate() {
  if owned_caffeinate_is_running; then
    return 0
  fi

  mkdir -p "$STATE_DIR"
  "$CAFFEINATE_BIN" -i >/dev/null 2>&1 &
  pid=$!
  printf '%s\n' "$pid" > "$CAFFEINATE_PID_FILE"
}

stop_owned_caffeinate() {
  if ! [ -f "$CAFFEINATE_PID_FILE" ]; then
    return 0
  fi

  pid="$(cat "$CAFFEINATE_PID_FILE" 2>/dev/null || true)"
  if owned_caffeinate_is_running; then
    kill "$pid"
  fi
  rm -f "$CAFFEINATE_PID_FILE"
}

check_gh() {
  "$GH_BIN" auth status >/dev/null 2>&1
}

check_git_repo() {
  "$GIT_BIN" rev-parse --is-inside-work-tree >/dev/null 2>&1 &&
    "$GIT_BIN" remote get-url origin >/dev/null 2>&1 &&
    [ "$("$GIT_BIN" config --worktree --get core.hooksPath 2>/dev/null || true)" = '.githooks' ]
}

check_firewall() {
  output="$("$FIREWALL_BIN" --getglobalstate 2>&1 || true)"
  printf '%s' "$output" | grep -Eiq 'enabled.*state[[:space:]]*=[[:space:]]*1|state[[:space:]]*=[[:space:]]*1'
}

print_check() {
  label="$1"
  if "$2"; then
    printf '✓ %s\n' "$label"
    return 0
  fi
  printf '✗ %s\n' "$label"
  return 1
}

run_checks() {
  failed=0
  print_check 'OpenCode background service running' service_is_running || failed=1
  print_check 'OpenCode is configured localhost-only' service_is_configured_private || failed=1
  print_check "OpenCode listens only on $HOST:$PORT" listener_is_loopback_only || failed=1
  print_check 'OpenCode responds locally' local_http_responds || failed=1
  print_check 'Tailscale is connected' tailscale_is_connected || failed=1
  print_check 'No public Funnel is configured' funnel_is_disabled || failed=1
  print_check 'Tailscale Serve is owned and targets OpenCode' check_serve_mapping || failed=1
  print_check 'GitHub CLI is authenticated' check_gh || failed=1
  print_check 'Repository origin and Git hooks are configured' check_git_repo || failed=1
  print_check 'mise is available' check_mise || failed=1
  print_check 'Owned sleep prevention is active' owned_caffeinate_is_running || failed=1
  print_check 'macOS application firewall is enabled' check_firewall || failed=1
  return "$failed"
}

check_serve_mapping() {
  config="$(serve_config)"
  ! json_is_empty "$config" && serve_is_owned && serve_matches_opencode "$config"
}

check_mise() {
  "$MISE_BIN" --version >/dev/null 2>&1
}

start() {
  require_executable 'OpenCode CLI' "$OPENCODE_BIN"
  require_executable 'Tailscale CLI' "$TAILSCALE_BIN"
  require_executable 'curl' "$CURL_BIN"
  require_executable 'lsof' "$LSOF_BIN"
  require_executable 'GitHub CLI' "$GH_BIN"
  require_executable 'mise' "$MISE_BIN"
  tailscale_is_connected
  check_gh || fail 'GitHub CLI is not authenticated. Run gh auth login -h github.com.'
  check_git_repo || fail 'This repository needs origin and worktree Git hooks before remote mode starts.'
  funnel_is_disabled
  check_serve_safety_before_start
  configure_opencode_service
  listener_is_loopback_only || fail "OpenCode is not listening only on $HOST:$PORT."
  local_http_responds || fail 'OpenCode did not respond locally.'
  ensure_serve
  ensure_caffeinate
  url="https://$(magic_dns_name)"
  printf 'READY — private OpenCode is available at %s\n' "$url"
}

ready() {
  require_executable 'OpenCode CLI' "$OPENCODE_BIN"
  require_executable 'Tailscale CLI' "$TAILSCALE_BIN"
  require_executable 'curl' "$CURL_BIN"
  require_executable 'lsof' "$LSOF_BIN"
  require_executable 'GitHub CLI' "$GH_BIN"
  require_executable 'mise' "$MISE_BIN"
  if run_checks; then
    printf 'READY — safe to leave the Mac and work from your phone.\n'
    return 0
  fi
  fail 'Remote OpenCode is not ready; run mise run opencode:remote to repair it.'
}

status() {
  if run_checks; then
    printf 'STATUS: healthy\n'
  else
    printf 'STATUS: needs attention; start would repair only owned configuration.\n'
  fi
  return 0
}

pair() {
  require_executable 'OpenCode CLI' "$OPENCODE_BIN"
  require_executable 'Tailscale CLI' "$TAILSCALE_BIN"
  tailscale_is_connected
  url="https://$(magic_dns_name)"
  printf 'Pair from your iPhone using the private URL: %s\n' "$url"
  "$OPENCODE_BIN" pair --url "$url"
}

stop() {
  require_executable 'OpenCode CLI' "$OPENCODE_BIN"
  "$OPENCODE_BIN" service stop || true
  if serve_is_owned; then
    config="$(serve_config)"
    if serve_matches_opencode "$config"; then
      "$TAILSCALE_BIN" serve --https=443 off
      rm -f "$SERVE_OWNERSHIP_FILE"
    else
      printf 'Leaving changed Tailscale Serve configuration intact because it no longer matches this setup.\n' >&2
    fi
  fi
  stop_owned_caffeinate
  printf 'Stopped OpenCode remote access; Tailscale remains connected.\n'
}

case "${1:-}" in
  start) start ;;
  ready) ready ;;
  status) status ;;
  pair) pair ;;
  stop) stop ;;
  *)
    printf 'Usage: %s {start|ready|status|pair|stop}\n' "$0" >&2
    exit 2
    ;;
esac
