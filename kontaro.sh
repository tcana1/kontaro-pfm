#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT/app"
IMPORTER_DIR="$ROOT/importer"
COMPOSE_FILE="$ROOT/docker-compose.yml"
PID_DIR="$ROOT/.dev-pids"
LOG_DIR="$ROOT/.dev-logs"
SUPABASE_CONTAINER="supabase_db_pfm"

# Global flag: --env-file <path> (anywhere on the command line). Used both for
# `docker compose --env-file` and for the env sourced by the selfhost commands.
ENV_FILE=""
_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)   [[ $# -ge 2 ]] || { echo "[pfm] --env-file requires a path" >&2; exit 1; }
                  ENV_FILE="$2"; shift 2 ;;
    --env-file=*) ENV_FILE="${1#--env-file=}"; shift ;;
    *)            _args+=("$1"); shift ;;
  esac
done
set -- ${_args[@]+"${_args[@]}"}
if [[ -n "$ENV_FILE" ]]; then
  [[ -f "$ENV_FILE" ]] || { echo "[pfm] env file not found: $ENV_FILE" >&2; exit 1; }
  ENV_FILE="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
fi

dc() { docker compose ${ENV_FILE:+--env-file "$ENV_FILE"} -f "$COMPOSE_FILE" "$@"; }

# ── Colors ─────────────────────────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'
log()  { echo -e "${G}[pfm]${NC} $1"; }
warn() { echo -e "${Y}[pfm]${NC} $1"; }
err()  { echo -e "${R}[pfm]${NC} $1"; }

# ── PID helpers ────────────────────────────────────────────────────────────────
pid_file()  { echo "$PID_DIR/$1.pid"; }
save_pid()  { mkdir -p "$PID_DIR"; echo "$2" > "$(pid_file "$1")"; }
read_pid()  { local f; f="$(pid_file "$1")"; [[ -f "$f" ]] && cat "$f" || echo ""; }
clear_pid() { rm -f "$(pid_file "$1")"; }
pid_alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

# ── Docker container check ─────────────────────────────────────────────────────
container_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${1}$"
}

# Importer lives in the root compose (service "importer") — not in its own
# compose file anymore (monorepo). Query the compose project for a running
# container instead of matching a container name.
importer_running() {
  dc ps -q importer 2>/dev/null | grep -q .
}

# ── Zombie detection (PID-based services only) ─────────────────────────────────
find_zombie() {
  case "$1" in
    frontend) pgrep -f "$FRONTEND_DIR/node_modules" 2>/dev/null | head -1 ;;
  esac
}

# ── Service state ──────────────────────────────────────────────────────────────
# Returns "STATE:DETAIL" — STATE = running|zombie|dead|stopped
get_state() {
  local name="$1"

  if [[ "$name" == "supabase" || "$name" == "importer" ]]; then
    if [[ "$name" == "supabase" ]]; then
      container_running "$SUPABASE_CONTAINER" && echo "running:docker" || echo "stopped:"
    else
      importer_running && echo "running:compose" || echo "stopped:"
    fi
    return
  fi

  local pid; pid="$(read_pid "$name")"
  if [[ -n "$pid" ]]; then
    if pid_alive "$pid"; then
      echo "running:$pid"
    else
      clear_pid "$name"
      echo "dead:$pid"
    fi
  else
    local zp; zp="$(find_zombie "$name")"
    [[ -n "$zp" ]] && echo "zombie:$zp" || echo "stopped:"
  fi
}

# ── Status ─────────────────────────────────────────────────────────────────────
SERVICES=(supabase frontend importer)

do_status() {
  local quiet="${1:-}"
  local exit_code=0
  local mode_label=""
  [[ -f "$PID_DIR/mode" ]] && mode_label=" ($(cat "$PID_DIR/mode"))"

  [[ -z "$quiet" ]] && { echo ""; log "Service status:"; echo ""; }

  for svc in "${SERVICES[@]}"; do
    local raw; raw="$(get_state "$svc")"
    local state="${raw%%:*}"
    local detail="${raw#*:}"
    local dsuf=""; [[ -n "$detail" ]] && dsuf=" ($detail)"
    local label="$svc"
    [[ "$svc" == "frontend" ]] && label="frontend${mode_label}"

    case "$state" in
      running)
        [[ -z "$quiet" ]] && printf "  %-22s ${G}● running${NC}%s\n" "$label" "$dsuf"
        ;;
      stopped)
        if [[ "$svc" == "supabase" ]]; then
          [[ -z "$quiet" ]] && printf "  %-22s ${R}✗ stopped${NC}\n" "$svc"
          exit_code=1
        else
          [[ -z "$quiet" ]] && printf "  %-22s ${DIM}○ stopped${NC}\n" "$label"
        fi
        ;;
      zombie)
        [[ -z "$quiet" ]] && printf "  %-22s ${Y}⚠ zombie${NC}%s — not tracked (run --kill)\n" "$label" "$dsuf"
        exit_code=1
        ;;
      dead)
        [[ -z "$quiet" ]] && printf "  %-22s ${R}✗ dead${NC}%s — stale PID cleaned up\n" "$label" "$dsuf"
        exit_code=1
        ;;
    esac
  done

  [[ -z "$quiet" ]] && echo ""
  return $exit_code
}

# ── Start ──────────────────────────────────────────────────────────────────────
do_start() {
  local mode="${1:-dev}"
  if [[ "$mode" != "dev" && "$mode" != "preview" ]]; then
    err "Unknown mode '$mode'. Use: dev or preview"
    exit 1
  fi

  # Pre-flight: abort if any managed service is already running or zombie
  local abort=false
  local raw state
  raw="$(get_state frontend)"; state="${raw%%:*}"
  if [[ "$state" == "running" || "$state" == "zombie" ]]; then
    warn "'frontend' is already running. Use --stop or --kill first."
    abort=true
  fi
  if [[ "$mode" == "dev" ]] && importer_running; then
    warn "'importer' container is already running. Use --stop first."
    abort=true
  fi
  $abort && { err "Aborting."; exit 1; }

  if ! container_running "$SUPABASE_CONTAINER"; then
    log "Starting Supabase..."
    (cd "$ROOT" && supabase start) || { err "Supabase failed to start."; exit 1; }
  fi

  mkdir -p "$PID_DIR" "$LOG_DIR"
  echo "$mode" > "$PID_DIR/mode"

  # 1. Statement importer — dev only (root compose; needs the debug port published
  #    in docker-compose.yml so the frontend dev server can reach http://localhost:8000)
  #if [[ "$mode" == "dev" ]]; then
  #  log "Starting statement importer (port 8000)..."
  #  docker compose -f "$COMPOSE_FILE" up --build -d importer \
  #    > "$LOG_DIR/importer.log" 2>&1 \
  #    && log "  Importer started." \
  #    || { err "Importer failed to start — check $LOG_DIR/importer.log"; }
  #fi

  # 2. Frontend
  if [[ "$mode" == "preview" ]]; then
    log "Building frontend for preview..."
    (cd "$FRONTEND_DIR" && npm run build) \
      || { err "Build failed — aborting."; rm -f "$PID_DIR/mode"; exit 1; }
    log "Starting frontend in preview mode (port 8181)..."
    (cd "$FRONTEND_DIR" && exec npm run preview) \
      > "$LOG_DIR/frontend.log" 2>&1 &
  else
    log "Starting frontend in dev mode (port 8181)..."
    (cd "$FRONTEND_DIR" && exec npm run dev) \
      > "$LOG_DIR/frontend.log" 2>&1 &
  fi
  save_pid frontend $!

  log ""
  log "All services started ($mode mode)."
  log ""
  log "  Frontend:  http://localhost:8181"
  [[ "$mode" == "dev" ]] && log "  Importer:  http://localhost:8000"
  log "  Supabase:  http://localhost:54331  (Studio: http://localhost:54333)"
  log ""
  log "  Logs:  tail -f $LOG_DIR/<service>.log"
  log "  Stop:  $(basename "$0") --stop"
  log ""
}

# ── Stop ───────────────────────────────────────────────────────────────────────
do_stop() {
  log "Stopping all services..."

  # Importer (root compose)
  if importer_running; then
    dc stop importer \
      && log "  Stopped importer." \
      || warn "  Failed to stop importer."
  else
    log "  importer — not running"
  fi

  # Frontend (PID)
  local pid; pid="$(read_pid frontend)"
  if [[ -n "$pid" ]]; then
    if pid_alive "$pid"; then
      if kill "$pid" 2>/dev/null; then
        log "  Stopped frontend (pid $pid)"
        clear_pid frontend
        # Wait up to 3s for graceful SIGTERM exit before the zombie check below
        local i; for i in 1 2 3 4 5 6; do pid_alive "$pid" || break; sleep 0.5; done
      else
        warn "  Failed to stop frontend (pid $pid) — PID file kept"
      fi
    else
      warn "  frontend PID $pid was already gone"
      clear_pid frontend
    fi
  else
    local zp; zp="$(find_zombie frontend)"
    if [[ -n "$zp" ]]; then
      kill "$zp" 2>/dev/null && log "  Stopped frontend (pid $zp, no PID file)" || warn "  Failed to stop frontend (pid $zp)"
    else
      log "  frontend — not running"
    fi
  fi

  rm -f "$PID_DIR/mode"

  # Post-stop zombie check (frontend only — Docker handles importer cleanup)
  local raw; raw="$(get_state frontend)"
  local state="${raw%%:*}"
  if [[ "$state" == "running" || "$state" == "zombie" ]]; then
    warn "  'frontend' still running after stop — use --kill"
    return 1
  fi

  # Supabase
  if container_running "$SUPABASE_CONTAINER"; then
    log "Stopping Supabase..."
    (cd "$ROOT" && supabase stop) && log "  Stopped Supabase." || warn "  Failed to stop Supabase."
  else
    log "  supabase — not running"
  fi

  log "Done."
}

# ── Kill ───────────────────────────────────────────────────────────────────────
do_kill() {
  warn "Force-killing all managed services..."

  # Importer (root compose)
  if importer_running; then
    dc kill importer \
      && log "  Killed importer." || true
  fi

  # Frontend (PID)
  local pid; pid="$(read_pid frontend)"
  if [[ -n "$pid" ]] && pid_alive "$pid"; then
    kill -9 "$pid" 2>/dev/null && log "  Killed frontend (pid $pid)" || true
  fi
  clear_pid frontend

  local zp; zp="$(find_zombie frontend)"
  if [[ -n "$zp" && "$zp" != "${pid:-}" ]]; then
    kill -9 "$zp" 2>/dev/null && log "  Killed frontend zombie (pid $zp)" || true
  fi

  rm -f "$PID_DIR/mode"

  # Supabase
  if container_running "$SUPABASE_CONTAINER"; then
    (cd "$ROOT" && supabase stop) && log "  Stopped Supabase." || warn "  Failed to stop Supabase."
  fi

  log "Done."
}

# ── Selfhost helpers ───────────────────────────────────────────────────────────

# Source the env file (--env-file, default $ROOT/.env) so selfhost commands have
# access to SUPABASE_JWT_SECRET / SUPABASE_URL.
_load_env() {
  local envfile="${ENV_FILE:-$ROOT/.env}"
  if [[ ! -f "$envfile" ]]; then
    err "$envfile not found — copy .env.selfhost.example → .env and fill in the values"
    exit 1
  fi
  set -a; . "$envfile"; set +a
}

# Derive a short-lived HS256 JWT for one admin call. Unlike the anon key in
# app/entrypoint.sh (iat=0, so it stays stable across restarts), these tokens grant
# service_role, so they expire in 5 minutes to limit the damage if one escapes.
_derive_jwt() {
  local role="$1" secret="$2"
  local now hdr pay sig
  now=$(date +%s)
  hdr=$(printf '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '\n=' | tr '+/' '-_')
  pay=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$now" "$((now + 300))" \
    | base64 | tr -d '\n=' | tr '+/' '-_')
  sig=$(printf '%s.%s' "$hdr" "$pay" | openssl dgst -binary -sha256 -hmac "$secret" | base64 | tr -d '\n=' | tr '+/' '-_')
  printf '%s.%s.%s' "$hdr" "$pay" "$sig"
}

# curl against the GoTrue admin API. The service_role token and the request body
# (which carries passwords) travel in a config file on stdin instead of argv, since
# argv is world-readable through `ps` while a pipe is not. Pass "" as body for GET.
# Quoted config values need \ and " escaped; curl unescapes them byte-for-byte.
_admin_curl() {
  local svc_key="$1" body="$2" esc
  shift 2
  {
    printf 'header = "Authorization: Bearer %s"\n' "$svc_key"
    printf 'header = "apikey: %s"\n' "$svc_key"
    if [[ -n "$body" ]]; then
      esc=${body//\\/\\\\}
      esc=${esc//\"/\\\"}
      printf 'header = "Content-Type: application/json"\n'
      printf 'data = "%s"\n' "$esc"
    fi
  } | curl -sf -K - "$@"
}

# Read a password without echoing it or putting it in argv. Falls back to
# $PFM_PASSWORD for non-interactive use (CI, scripts).
_read_password() {
  local prompt="$1" pw
  if [[ -n "${PFM_PASSWORD:-}" ]]; then
    printf '%s' "$PFM_PASSWORD"
    return
  fi
  if [[ ! -t 0 ]]; then
    err "No TTY to prompt for a password — set PFM_PASSWORD instead"
    exit 1
  fi
  read -rsp "$prompt" pw </dev/tty
  printf '\n' >&2
  [[ -z "$pw" ]] && { err "Password must not be empty"; exit 1; }
  printf '%s' "$pw"
}

# ── Selfhost: find user id by email ────────────────────────────────────────────
# The admin list endpoint ignores ?email= filters (verified on GoTrue v2.196),
# so fetch the users and match the email exactly here. A page of 100 is plenty
# for the expected handful of users.
_find_user_id() {
  local email="$1" svc_key="$2"
  _admin_curl "$svc_key" "" "${SUPABASE_URL}/auth/v1/admin/users?per_page=100" \
    | python3 -c '
import json, sys
target = sys.argv[1].lower()
users = json.load(sys.stdin).get("users", [])
matches = [u["id"] for u in users if (u.get("email") or "").lower() == target]
print(matches[0] if matches else "")
' "$email"
}

# ── Selfhost: create user ──────────────────────────────────────────────────────
do_create_user() {
  local email="${1:-}" password="${2:-}"
  if [[ -z "$email" ]]; then
    err "Usage: $(basename "$0") create-user <email>"
    exit 1
  fi
  if [[ -n "$password" ]]; then
    warn "Passing the password as an argument exposes it via \`ps\` — omit it to be prompted"
  else
    password="$(_read_password "Password for ${email}: ")"
  fi
  _load_env
  [[ -z "${SUPABASE_JWT_SECRET:-}" ]] && { err "SUPABASE_JWT_SECRET not set in .env"; exit 1; }
  [[ -z "${SUPABASE_URL:-}" ]]        && { err "SUPABASE_URL not set in .env"; exit 1; }
  local svc_key body
  svc_key="$(_derive_jwt service_role "$SUPABASE_JWT_SECRET")"
  # `role: authenticated` is required: GoTrue mints the JWT `role` claim from
  # auth.users.role (which defaults to ''), and PostgREST does SET ROLE from
  # that claim — an empty claim fails with 22023 'role "" does not exist'.
  body="$(PFM_EMAIL="$email" PFM_PASS="$password" python3 -c '
import json, os
print(json.dumps({"email": os.environ["PFM_EMAIL"], "password": os.environ["PFM_PASS"],
                  "email_confirm": True, "role": "authenticated"}))')"
  _admin_curl "$svc_key" "$body" -X POST "${SUPABASE_URL}/auth/v1/admin/users" > /dev/null \
    || { err "Failed to create user — is the selfhost stack running?"; exit 1; }
  log "Created user: ${email}"
}

# ── Selfhost: reset password ───────────────────────────────────────────────────
do_reset_password() {
  local email="${1:-}" password="${2:-}"
  if [[ -z "$email" ]]; then
    err "Usage: $(basename "$0") reset-password <email>"
    exit 1
  fi
  if [[ -n "$password" ]]; then
    warn "Passing the password as an argument exposes it via \`ps\` — omit it to be prompted"
  else
    password="$(_read_password "New password for ${email}: ")"
  fi
  _load_env
  [[ -z "${SUPABASE_JWT_SECRET:-}" ]] && { err "SUPABASE_JWT_SECRET not set in .env"; exit 1; }
  [[ -z "${SUPABASE_URL:-}" ]]        && { err "SUPABASE_URL not set in .env"; exit 1; }
  local svc_key
  svc_key="$(_derive_jwt service_role "$SUPABASE_JWT_SECRET")"
  # Fetch user ID by email (admin list ignores ?email= — see _find_user_id).
  local user_id body
  user_id="$(_find_user_id "$email" "$svc_key")" \
    || { err "Failed to list users — is the selfhost stack running?"; exit 1; }
  [[ -z "$user_id" ]] && { err "User not found: ${email}"; exit 1; }
  body="$(PFM_PASS="$password" python3 -c '
import json, os
print(json.dumps({"password": os.environ["PFM_PASS"]}))')"
  _admin_curl "$svc_key" "$body" -X PUT "${SUPABASE_URL}/auth/v1/admin/users/${user_id}" > /dev/null \
    || { err "Failed to reset password"; exit 1; }
  log "Password reset for: ${email}"
}

# ── Selfhost: set user role ────────────────────────────────────────────────────
# Fixes tokens issued with an empty role claim. GoTrue mints the JWT `role`
# claim from auth.users.role (defaults to ''), and PostgREST does SET ROLE from
# that claim — an empty claim makes every RPC fail with 22023 'role "" does
# not exist'. Needed for users created by UI signup (public signup can't set
# the role); kontaro.sh create-user already sets it.
do_set_role() {
  local email="${1:-}" role="${2:-authenticated}"
  if [[ -z "$email" ]]; then
    err "Usage: $(basename "$0") set-role <email> [role]"
    exit 1
  fi
  _load_env
  [[ -z "${SUPABASE_JWT_SECRET:-}" ]] && { err "SUPABASE_JWT_SECRET not set in .env"; exit 1; }
  [[ -z "${SUPABASE_URL:-}" ]]        && { err "SUPABASE_URL not set in .env"; exit 1; }
  local svc_key
  svc_key="$(_derive_jwt service_role "$SUPABASE_JWT_SECRET")"
  local user_id body
  user_id="$(_find_user_id "$email" "$svc_key")" \
    || { err "Failed to list users — is the selfhost stack running?"; exit 1; }
  [[ -z "$user_id" ]] && { err "User not found: ${email}"; exit 1; }
  body="$(PFM_ROLE="$role" python3 -c '
import json, os
print(json.dumps({"role": os.environ["PFM_ROLE"]}))')"
  _admin_curl "$svc_key" "$body" -X PUT "${SUPABASE_URL}/auth/v1/admin/users/${user_id}" > /dev/null \
    || { err "Failed to set role"; exit 1; }
  log "Role '${role}' set for: ${email}"
}

# ── Selfhost: backup ──────────────────────────────────────────────────────────
do_backup() {
  local outfile="${ROOT}/backup-$(date +%Y%m%d-%H%M%S).sql"
  log "Creating backup → ${outfile}"
  dc exec db \
    pg_dump -U postgres postgres > "$outfile" \
    || { err "Backup failed — is the selfhost db container running?"; exit 1; }
  log "Backup complete: ${outfile}"
}

# ── Help ───────────────────────────────────────────────────────────────────────
do_help() {
  echo ""
  echo "  Usage: $(basename "$0") [--env-file <path>] <command> [args]"
  echo ""
  echo "  --env-file <path>  Env file for docker compose and the selfhost commands (default: .env)"
  echo ""
  echo "  Dev environment:"
  printf "    %-32s %s\n" "--start [dev|preview]" "Start all services (default: dev)"
  printf "    %-32s %s\n" "--stop"                "Stop all services (including Supabase)"
  printf "    %-32s %s\n" "--status"              "Show per-service status (exits 1 on any anomaly)"
  printf "    %-32s %s\n" "--kill"                "Force-kill all services via SIGKILL"
  echo ""
  echo "  Selfhost (requires running selfhost stack):"
  printf "    %-32s %s\n" "create-user <email>"     "Create a new user via GoTrue admin API (prompts for password)"
  printf "    %-32s %s\n" "set-role <email> [role]" "Set auth role (fixes empty-role tokens from UI signup)"
  printf "    %-32s %s\n" "reset-password <email>"  "Reset an existing user's password (prompts)"
  printf "    %-32s %s\n" "backup"                  "Dump DB to backup-YYYYMMDD-HHMMSS.sql"
  echo ""
  echo "  Set PFM_PASSWORD to skip the password prompt (non-interactive use)."
  echo ""
  echo "  Logs: $LOG_DIR/<service>.log"
  echo ""
}

# ── Dispatch ───────────────────────────────────────────────────────────────────
case "${1:-}" in
  --start)         do_start "${2:-dev}" ;;
  --stop)          do_stop ;;
  --status)        do_status ;;
  --kill)          do_kill ;;
  create-user)     do_create_user "${2:-}" "${3:-}" ;;
  set-role)        do_set_role "${2:-}" "${3:-}" ;;
  reset-password)  do_reset_password "${2:-}" "${3:-}" ;;
  backup)          do_backup ;;
  --help|"") do_help; exit 0 ;;
  *) err "Unknown command: ${1}"; do_help; exit 1 ;;
esac
