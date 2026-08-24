#!/usr/bin/env bash
# Switch the local Docker deployment between Local Mode and Cloud Mode, or run
# both side by side, without hand-assembling Compose flags each time.
set -Eeuo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
repository_root=$(cd -- "$script_dir/../.." && pwd -P)
deploy_script="$script_dir/docker-deploy.sh"

local_port=${LOCAL_MODE_PORT:-3001}
cloud_port=${CLOUD_MODE_PORT:-3002}

usage() {
  cat <<'EOF'
Usage: code/scripts/mode-switch.sh <target> [options]

Targets:
  local     Stop Cloud Mode, then build and start Local Mode.
  cloud     Stop Local Mode, then build and start Cloud Mode.
  both      Start (or keep) both modes on their own ports and Compose projects.
  status    Show which modes are running, on which ports.
  stop      Stop both modes; the SQLite state volumes are preserved.
  logs      Follow one mode's logs (requires --mode local|cloud).

Options:
  --keep-other      With local/cloud: leave the other mode running instead of
                    stopping it. Equivalent to using "both" for that direction.
  --preview-secrets Start Cloud Mode with throwaway in-process credentials so the
                    anonymous public view can be inspected without a GitHub OAuth
                    app. GitHub login will not work. Never use for a deployment.
  --mode M          Which mode "logs" should follow.
  -h, --help        Show this help.

Environment:
  LOCAL_MODE_PORT   Host port for Local Mode (default: 3001).
  CLOUD_MODE_PORT   Host port for Cloud Mode (default: 3002).

Both modes bind 127.0.0.1 only and use separate Compose projects
(agent-learning-hub-local / agent-learning-hub-cloud), so their containers,
networks and SQLite volumes never collide and either one can be stopped alone.

Local Mode mounts ../local-courses read-only and signs in a fixed single user.
Cloud Mode is the public view: it never mounts local material, and it needs
BETTER_AUTH_SECRET, BETTER_AUTH_URL, GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
from the repository-root .env or the shell (see --preview-secrets).
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '==> %s\n' "$*"
}

target=""
mode_for_logs=""
keep_other=0
preview_secrets=0

if [[ $# -eq 0 ]]; then
  usage >&2
  exit 2
fi

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
  local | cloud | both | status | stop | logs)
    target=$1
    shift
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-other)
      keep_other=1
      shift
      ;;
    --preview-secrets)
      preview_secrets=1
      shift
      ;;
    --mode)
      mode_for_logs=${2:-}
      [[ $mode_for_logs == "local" || $mode_for_logs == "cloud" ]] ||
        fail '--mode expects "local" or "cloud".'
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

[[ -x $deploy_script ]] ||
  fail "Deployment helper is missing or not executable: $deploy_script"

# Cloud Compose declares its credentials with ${VAR:?}, so every Compose call in
# cloud mode fails without them -- including "down" and "ps", which start
# nothing. Supply obvious throwaway values for those read-only and teardown
# calls, and require an explicit opt-in before actually starting a container.
cloud_secret_keys=(
  BETTER_AUTH_SECRET
  BETTER_AUTH_URL
  GITHUB_CLIENT_ID
  GITHUB_CLIENT_SECRET
)

env_file_has() {
  local key=$1
  [[ -f "$repository_root/.env" ]] || return 1
  grep -Eq "^[[:space:]]*${key}[[:space:]]*=[[:space:]]*[^[:space:]]" \
    "$repository_root/.env"
}

# Returns the missing keys space-separated: macOS still ships bash 3.2, which has
# no mapfile to read a multi-line result back into an array.
missing_cloud_secrets() {
  local key
  local missing=""
  for key in "${cloud_secret_keys[@]}"; do
    if [[ -z ${!key:-} ]] && ! env_file_has "$key"; then
      missing="${missing:+$missing }$key"
    fi
  done
  printf '%s' "$missing"
}

# Only fills keys that are missing from both the shell and .env: an exported
# placeholder outranks the .env value in Compose interpolation, so filling a key
# that is already configured would quietly replace real configuration.
# The values are named so anything that reaches a log or "docker inspect" is
# unmistakably not a credential.
export_placeholder_cloud_secrets() {
  local key
  for key in "${cloud_secret_keys[@]}"; do
    if [[ -n ${!key:-} ]] || env_file_has "$key"; then
      continue
    fi
    case "$key" in
      BETTER_AUTH_SECRET)
        export BETTER_AUTH_SECRET="local-preview-not-a-real-secret"
        ;;
      BETTER_AUTH_URL)
        export BETTER_AUTH_URL="http://127.0.0.1:$cloud_port"
        ;;
      GITHUB_CLIENT_ID)
        export GITHUB_CLIENT_ID="local-preview-not-a-real-oauth-app"
        ;;
      GITHUB_CLIENT_SECRET)
        export GITHUB_CLIENT_SECRET="local-preview-not-a-real-oauth-secret"
        ;;
    esac
  done
}

prepare_cloud_start() {
  local missing
  missing=$(missing_cloud_secrets)
  if [[ -z $missing ]]; then
    return 0
  fi
  if [[ $preview_secrets -ne 1 ]]; then
    printf 'Cloud Mode is missing: %s\n' "$missing" >&2
    cat >&2 <<EOF

Fill them into $repository_root/.env (see .env.example), or re-run with
--preview-secrets to inspect the anonymous public view with throwaway values.
GitHub login needs a real OAuth app whose callback is
\${BETTER_AUTH_URL}/api/auth/callback/github.
EOF
    exit 2
  fi
  info "Starting Cloud Mode with throwaway credentials; GitHub login will fail."
  export_placeholder_cloud_secrets
}

run_local() {
  APP_BIND_HOST=127.0.0.1 APP_PORT=$local_port "$deploy_script" local "$@"
}

run_cloud() {
  APP_BIND_HOST=127.0.0.1 APP_PORT=$cloud_port "$deploy_script" cloud "$@"
}

# Teardown and status never start a container, so placeholders are safe here and
# keep "stop" working on a machine that has no cloud credentials at all.
run_cloud_control() {
  (
    export_placeholder_cloud_secrets
    run_cloud "$@"
  )
}

stop_mode() {
  local mode=$1
  info "Stopping $mode mode (SQLite volume preserved)"
  if [[ $mode == "local" ]]; then
    run_local down
  else
    run_cloud_control down
  fi
}

report_ready() {
  local mode=$1 port=$2
  printf '\n%s Mode is ready: http://127.0.0.1:%s\n' "$mode" "$port"
}

case "$target" in
  local)
    [[ $keep_other -eq 1 ]] || stop_mode cloud
    info "Building and starting Local Mode on 127.0.0.1:$local_port"
    run_local up
    report_ready Local "$local_port"
    ;;
  cloud)
    [[ $keep_other -eq 1 ]] || stop_mode local
    prepare_cloud_start
    info "Building and starting Cloud Mode on 127.0.0.1:$cloud_port"
    run_cloud up
    report_ready Cloud "$cloud_port"
    ;;
  both)
    prepare_cloud_start
    info "Building and starting Local Mode on 127.0.0.1:$local_port"
    run_local up
    info "Building and starting Cloud Mode on 127.0.0.1:$cloud_port"
    run_cloud up
    report_ready Local "$local_port"
    report_ready Cloud "$cloud_port"
    ;;
  status)
    # The heading is the port this invocation would start on; the PORTS column
    # below is where a container is actually published, which differs whenever
    # something started it with another APP_PORT.
    printf '== Local Mode (would start on 127.0.0.1:%s) ==\n' "$local_port"
    run_local status
    printf '\n== Cloud Mode (would start on 127.0.0.1:%s) ==\n' "$cloud_port"
    run_cloud_control status
    ;;
  stop)
    stop_mode local
    stop_mode cloud
    ;;
  logs)
    [[ -n $mode_for_logs ]] || fail 'logs requires --mode local|cloud.'
    if [[ $mode_for_logs == "local" ]]; then
      run_local logs
    else
      run_cloud_control logs
    fi
    ;;
esac
