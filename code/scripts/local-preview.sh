#!/usr/bin/env bash
# Run the latest workspace implementation as a local Docker preview.
set -Eeuo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
deploy_script="$script_dir/docker-deploy.sh"

usage() {
  cat <<'EOF'
Usage: code/scripts/local-preview.sh [up|restart|down|logs|status|verify]

Defaults to: up

  up       Build an image from the current workspace and start the preview.
  restart  Stop the preview, rebuild the image, and start it again.
  down     Stop the preview while preserving its SQLite volume.
  logs     Follow the application logs.
  status   Show the preview container status.
  verify   Call the preview health endpoint.

Environment:
  APP_PORT      Host port (default: 3001).
  WAIT_TIMEOUT  Container health wait in seconds (default: 120).

The preview only binds to 127.0.0.1. It mounts local-courses read-only and
delegates image builds, Compose lifecycle, and health checks to docker-deploy.sh.
EOF
}

action=${1:-up}
if [[ $action == "-h" || $action == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 2
fi

case "$action" in
  up|restart|down|logs|status|verify) ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if [[ ! -x $deploy_script ]]; then
  printf 'Deployment helper is missing or not executable: %s\n' "$deploy_script" >&2
  exit 1
fi

export APP_BIND_HOST=127.0.0.1
export APP_PORT=${APP_PORT:-3001}

preview_url="http://127.0.0.1:$APP_PORT"

start_preview() {
  "$deploy_script" local up
  printf '\nLocal preview is ready: %s\n' "$preview_url"
  printf 'Follow logs: %s logs\n' "$0"
  printf 'Stop it:     %s down\n' "$0"
}

case "$action" in
  up)
    start_preview
    ;;
  restart)
    "$deploy_script" local down
    start_preview
    ;;
  down|logs|status|verify)
    "$deploy_script" local "$action"
    ;;
esac
