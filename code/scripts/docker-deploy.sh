#!/usr/bin/env bash
# Build, start, inspect, and verify the Agent Learning Hub Docker deployment.
set -Eeuo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
application_root=$(cd -- "$script_dir/.." && pwd -P)
repository_root=$(cd -- "$application_root/.." && pwd -P)
docker_root="$application_root/docker"

usage() {
  cat <<'EOF'
Usage: code/scripts/docker-deploy.sh [local|cloud|release] [build|up|down|logs|status|config|verify]

Defaults to: local up

Modes:
  local    Build one image, mount ../local-courses read-only, and bind to loopback.
  cloud    Build one image with the Cloud Mode environment from .env or the shell.
  release  Pull and run a pinned APP_IMAGE; never builds source on the host.

Actions:
  build    Build the image only (not available for release mode).
  up       Start (or recreate) the app, wait for Compose health, then call /api/health.
  down     Stop the app and remove its containers and network; preserves the state volume.
  logs     Follow the app logs.
  status   Show the Compose service status.
  config   Validate the resolved Compose configuration without printing secrets.
  verify   Call /api/health on the configured host port.

Environment:
  APP_IMAGE             Image tag for local/cloud builds or required pinned release image.
  APP_BIND_HOST         Host binding (defaults to 127.0.0.1; local mode rejects non-loopback values).
  APP_PORT              Host port (defaults: local 3001, cloud 3002, release 3000).
                        The local defaults avoid the common 3000 dev-machine conflict;
                        release keeps 3000 for the cloud host loopback + Caddy runbooks.
  COMPOSE_PROJECT_NAME  Isolated Compose project name (default: agent-learning-hub-<mode>).
  COMPOSE_EXTRA_FILES   Colon-separated Compose overrides appended after the mode files.
                        Relative paths resolve from the repository root; local mode rejects them.
  WAIT_TIMEOUT          Compose health wait in seconds (default: 120).

When the repository-root .env file exists, it supplies Compose variables. Cloud
and release mode require their respective credentials or pinned APP_IMAGE.
EOF
}

mode="local"
action="up"

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  usage
  exit 0
fi

if [[ ${1:-} == "local" || ${1:-} == "cloud" || ${1:-} == "release" ]]; then
  mode=$1
  shift
fi

if [[ -n ${1:-} ]]; then
  action=$1
  shift
fi

if [[ $# -ne 0 ]]; then
  usage >&2
  exit 2
fi

case "$action" in
  build|up|down|logs|status|config|verify) ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'Docker CLI is required.' >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  printf '%s\n' 'Docker daemon is unavailable.' >&2
  exit 1
fi

bind_host=${APP_BIND_HOST:-127.0.0.1}
case "$mode" in
  local) default_port=3001 ;;
  cloud) default_port=3002 ;;
  release) default_port=3000 ;;
esac
port=${APP_PORT:-$default_port}
# Compose interpolates ${APP_PORT} from the shell environment before the
# --env-file, so export the resolved value to keep the published port and the
# health check below pointed at the same number.
export APP_PORT=$port
wait_timeout=${WAIT_TIMEOUT:-120}

if [[ $mode == "local" && $bind_host != "127.0.0.1" && $bind_host != "::1" && $bind_host != "localhost" ]]; then
  printf '%s\n' 'Local Mode only supports loopback APP_BIND_HOST values.' >&2
  exit 2
fi

compose_files=(
  -f "$docker_root/docker-compose.yml"
)

case "$mode" in
  local)
    compose_files+=( -f "$docker_root/docker-compose.local.yml" )
    ;;
  cloud)
    compose_files+=( -f "$docker_root/docker-compose.cloud.yml" )
    ;;
  release)
    compose_files+=(
      -f "$docker_root/docker-compose.cloud.yml"
      -f "$docker_root/docker-compose.release.yml"
    )
    ;;
esac

if [[ -n ${COMPOSE_EXTRA_FILES:-} ]]; then
  if [[ $mode == "local" ]]; then
    printf '%s\n' 'COMPOSE_EXTRA_FILES is not supported in local mode.' >&2
    exit 2
  fi
  IFS=':' read -r -a extra_files <<< "$COMPOSE_EXTRA_FILES"
  for extra_file in "${extra_files[@]}"; do
    if [[ -z $extra_file ]]; then
      printf '%s\n' 'COMPOSE_EXTRA_FILES contains an empty path.' >&2
      exit 2
    fi
    if [[ $extra_file != /* ]]; then
      extra_file="$repository_root/$extra_file"
    fi
    if [[ ! -f $extra_file ]]; then
      printf 'Compose override does not exist: %s\n' "$extra_file" >&2
      exit 2
    fi
    compose_files+=( -f "$extra_file" )
  done
fi

project_name=${COMPOSE_PROJECT_NAME:-"agent-learning-hub-$mode"}
compose=(docker compose)
if [[ -f "$repository_root/.env" ]]; then
  compose+=(--env-file "$repository_root/.env")
fi
compose+=(--project-name "$project_name" "${compose_files[@]}")

run_compose() {
  "${compose[@]}" "$@"
}

verify_health() {
  local health_host=$bind_host
  if [[ $health_host == "0.0.0.0" || $health_host == "::" ]]; then
    health_host="127.0.0.1"
  elif [[ $health_host == "::1" ]]; then
    health_host="[::1]"
  fi

  curl --fail --silent --show-error \
    "http://$health_host:$port/api/health"
  printf '\n'
}

case "$action" in
  build)
    if [[ $mode == "release" ]]; then
      printf '%s\n' 'Release mode pulls a published image and cannot build local source.' >&2
      exit 2
    fi
    run_compose build --quiet app
    ;;
  up)
    if [[ $mode == "release" ]]; then
      run_compose pull --quiet app
      run_compose up -d --wait --wait-timeout "$wait_timeout" app
    else
      run_compose up --build --quiet-build -d --wait --wait-timeout "$wait_timeout" app
    fi
    verify_health
    ;;
  down)
    run_compose down --remove-orphans
    ;;
  logs)
    run_compose logs --follow app
    ;;
  status)
    run_compose ps
    ;;
  config)
    run_compose config --quiet
    ;;
  verify)
    verify_health
    ;;
esac
