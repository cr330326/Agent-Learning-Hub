#!/usr/bin/env bash
# Run the deployed image's paired database tooling on the same Docker host.
set -Eeuo pipefail
maintenance_action=${1:-}
case "$maintenance_action" in
  backup|drill) ;;
  *) printf '%s\n' 'Usage: cloud-maintenance.sh backup|drill' >&2; exit 2 ;;
esac
maintenance_project=${COMPOSE_PROJECT_NAME:-agent-learning-hub-production}
backup_environment=${BACKUP_ENV_FILE:-/etc/agent-learning-hub/backup.env}
backup_directory=${BACKUP_HOST_PATH:-/var/backups/agent-learning-hub}
[[ $maintenance_project =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { printf '%s\n' 'Invalid Compose project.' >&2; exit 1; }
[[ -f $backup_environment && $backup_directory == /* ]] || { printf '%s\n' 'Backup env file and absolute output directory are required.' >&2; exit 1; }
application_container=$(docker ps -aq --filter "label=com.docker.compose.project=$maintenance_project" --filter label=com.docker.compose.service=app)
[[ -n $application_container && $application_container != *$'\n'* ]] || { printf '%s\n' 'Expected exactly one deployed application container.' >&2; exit 1; }
state_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data/state"}}{{.Name}}{{end}}{{end}}' "$application_container")
discovery_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data/discovery"}}{{.Name}}{{end}}{{end}}' "$application_container")
for volume in "$state_volume" "$discovery_volume"; do
  [[ $volume =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || { printf '%s\n' 'Both databases must use deployed named volumes.' >&2; exit 1; }
  docker volume inspect "$volume" >/dev/null
done
[[ $state_volume != "$discovery_volume" ]] || { printf '%s\n' 'Database volumes must be separate.' >&2; exit 1; }
maintenance_image=$(docker inspect --format '{{.Config.Image}}' "$application_container")
[[ $maintenance_image == *@sha256:* || ${maintenance_image##*/} == *:* ]] && [[ ${maintenance_image##*:} != latest ]] || { printf '%s\n' 'The deployed image must use a fixed version.' >&2; exit 1; }
tool_arguments=(--output-dir /secure/output)
if [[ $maintenance_action == drill ]]; then
  tool_arguments=(--output-dir /secure/output/restore-drill --backup-dir /secure/output)
fi
umask 077
mkdir -p -- "$backup_directory"
# BEGIN IMMEDIATE reserves both writer locks briefly. The tool reads snapshots
# through SQLite's online API; no state files are copied or manually replaced.
docker run --rm --network none \
  --mount "type=volume,src=$state_volume,dst=/data/state" \
  --mount "type=volume,src=$discovery_volume,dst=/data/discovery" \
  --mount "type=bind,src=$backup_directory,dst=/secure/output" \
  --env-file "$backup_environment" \
  --env "RESTORE_DRILL_HOST=$(hostname)" \
  "$maintenance_image" node .next/discovery-backup.mjs "$maintenance_action" "${tool_arguments[@]}"
