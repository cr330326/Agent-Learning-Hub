#!/usr/bin/env bash
# Operate the production release on a dedicated Tencent Cloud Lighthouse host.
set -Eeuo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
application_root=$(cd -- "$script_dir/.." && pwd -P)
repository_root=$(cd -- "$application_root/.." && pwd -P)

usage() {
  cat <<'EOF'
Usage: code/scripts/lighthouse-deploy.sh <action>

Actions:
  preflight   Read-only SSH, OS, privilege, disk, Docker, and Caddy checks.
  bootstrap   Install Docker Engine/Compose and Caddy on a dedicated Ubuntu host.
  configure   Upload root-owned application and optional backup environment files.
  deploy      Back up an existing database, stage a release bundle, and deploy it.
  backup      Create an application-native encrypted SQLite backup on the server.
  restore-drill
              Prove a fresh backup of live production data restores into a clean
              environment, with wrong-passphrase and tamper controls. Reads the
              state volume read-only and never touches the running release.
  rollback    Start the previous pinned application release; never restores data.
  verify      Check the internal health endpoint and public HTTPS endpoint.
  status      Show the release, Compose, Docker, Caddy, and disk status.
  logs        Follow application container logs until interrupted.

Required environment by action:
  LIGHTHOUSE_DOMAIN            Public DNS name (configure, deploy, rollback, verify).
  LIGHTHOUSE_IMAGE             Pinned image tag or sha256 digest (deploy).
  LIGHTHOUSE_ENV_FILE          Local untracked application env file (configure;
                               optional on deploy when already configured remotely).
  LIGHTHOUSE_BACKUP_ENV_FILE   Local root-secret file containing only
                               BACKUP_PASSPHRASE; optional after first configure.

Optional environment:
  LIGHTHOUSE_SSH_TARGET        SSH config alias (default: tencent-lighthouse).
  LIGHTHOUSE_REMOTE_ROOT       Remote release root (default: /opt/agent-learning-hub).
  LIGHTHOUSE_APP_PORT          Loopback application port (default: 3000).
  LIGHTHOUSE_COMPOSE_PROJECT   Compose project (default: agent-learning-hub-production).
  LIGHTHOUSE_WAIT_TIMEOUT      Container health timeout in seconds (default: 180).
  LIGHTHOUSE_MAINTENANCE_IMAGE Pinned Node image for backup tooling
                               (default: node:24.18.0-bookworm).
  LIGHTHOUSE_DRY_RUN=1         Validate and print the intended action without SSH writes.
  LIGHTHOUSE_ALLOW_NO_BACKUP=1 Break-glass upgrade/rollback without a pre-action backup.
  LIGHTHOUSE_ROLLBACK_CONFIRMED=1
                               Required acknowledgement for application rollback.
  LIGHTHOUSE_ALLOW_CADDY_REPLACE=1
                               Replace an unmarked Caddyfile on a dedicated host.

The script never creates Tencent Cloud firewall rules, DNS records, snapshots,
OAuth applications, or off-host backup copies. Complete those control-plane and
operations steps from docs/deploy/ before treating a release as production-ready.
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '==> %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required."
}

enabled() {
  [[ ${1:-0} == "1" || ${1:-false} == "true" ]]
}

strip_optional_quotes() {
  local raw_value=$1
  if [[ ${#raw_value} -ge 2 ]]; then
    if [[ ${raw_value:0:1} == '"' && ${raw_value: -1} == '"' ]]; then
      raw_value=${raw_value:1:${#raw_value}-2}
    elif [[ ${raw_value:0:1} == "'" && ${raw_value: -1} == "'" ]]; then
      raw_value=${raw_value:1:${#raw_value}-2}
    fi
  fi
  printf '%s' "$raw_value"
}

environment_value() {
  local environment_file=$1
  local variable_name=$2
  local match_count
  local matched_line
  match_count=$(grep -Ec "^${variable_name}=" "$environment_file" || true)
  [[ $match_count -eq 1 ]] ||
    fail "$environment_file must contain exactly one ${variable_name}= entry."
  matched_line=$(grep -E "^${variable_name}=" "$environment_file")
  strip_optional_quotes "${matched_line#*=}"
}

check_secret_file_permissions() {
  local secret_file=$1
  local permission_mode=""
  if permission_mode=$(stat -f '%Lp' "$secret_file" 2>/dev/null); then
    :
  elif permission_mode=$(stat -c '%a' "$secret_file" 2>/dev/null); then
    :
  else
    fail "Unable to inspect permissions for $secret_file."
  fi
  case "$permission_mode" in
    *00) ;;
    *) fail "$secret_file must not be readable or writable by group/other (use chmod 600)." ;;
  esac
}

validate_application_environment() {
  local environment_file=$1
  local expected_origin="https://$lighthouse_domain"
  local auth_secret
  local auth_origin
  local github_client_id
  local github_client_secret
  [[ -f $environment_file ]] || fail "Application env file not found: $environment_file"
  check_secret_file_permissions "$environment_file"
  auth_secret=$(environment_value "$environment_file" BETTER_AUTH_SECRET)
  auth_origin=$(environment_value "$environment_file" BETTER_AUTH_URL)
  github_client_id=$(environment_value "$environment_file" GITHUB_CLIENT_ID)
  github_client_secret=$(environment_value "$environment_file" GITHUB_CLIENT_SECRET)
  [[ ${#auth_secret} -ge 32 ]] || fail "BETTER_AUTH_SECRET must contain at least 32 characters."
  [[ $auth_origin == "$expected_origin" ]] ||
    fail "BETTER_AUTH_URL must be exactly $expected_origin."
  [[ -n $github_client_id ]] || fail "GITHUB_CLIENT_ID must not be empty."
  [[ -n $github_client_secret ]] || fail "GITHUB_CLIENT_SECRET must not be empty."
  if grep -Eq '^BACKUP_PASSPHRASE=' "$environment_file"; then
    fail "Keep BACKUP_PASSPHRASE in LIGHTHOUSE_BACKUP_ENV_FILE, not the application env file."
  fi
  if grep -Eq '^STATE_VOLUME_NAME=' "$environment_file"; then
    local state_volume_name
    state_volume_name=$(environment_value "$environment_file" STATE_VOLUME_NAME)
    [[ $state_volume_name =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] ||
      fail "STATE_VOLUME_NAME contains unsupported characters."
  fi
}

validate_backup_environment() {
  local environment_file=$1
  local backup_passphrase
  [[ -f $environment_file ]] || fail "Backup env file not found: $environment_file"
  check_secret_file_permissions "$environment_file"
  backup_passphrase=$(environment_value "$environment_file" BACKUP_PASSPHRASE)
  [[ ${#backup_passphrase} -ge 12 ]] ||
    fail "BACKUP_PASSPHRASE must contain at least 12 characters."
}

validate_common_configuration() {
  [[ $lighthouse_ssh_target =~ ^[A-Za-z0-9._@-]+$ ]] ||
    fail "LIGHTHOUSE_SSH_TARGET contains unsupported characters."
  [[ $lighthouse_remote_root =~ ^/[A-Za-z0-9._/-]+$ ]] ||
    fail "LIGHTHOUSE_REMOTE_ROOT must be a simple absolute path without spaces."
  [[ $lighthouse_remote_root != *'..'* && $lighthouse_remote_root != '/' ]] ||
    fail "LIGHTHOUSE_REMOTE_ROOT must not contain '..' or resolve to root."
  [[ $lighthouse_app_port =~ ^[0-9]+$ ]] || fail "LIGHTHOUSE_APP_PORT must be numeric."
  (( lighthouse_app_port >= 1024 && lighthouse_app_port <= 65535 )) ||
    fail "LIGHTHOUSE_APP_PORT must be between 1024 and 65535."
  [[ $lighthouse_compose_project =~ ^[a-z0-9][a-z0-9_-]*$ ]] ||
    fail "LIGHTHOUSE_COMPOSE_PROJECT must use lowercase letters, digits, '_' or '-'."
  [[ $lighthouse_wait_timeout =~ ^[0-9]+$ ]] ||
    fail "LIGHTHOUSE_WAIT_TIMEOUT must be numeric."
  (( lighthouse_wait_timeout >= 30 && lighthouse_wait_timeout <= 900 )) ||
    fail "LIGHTHOUSE_WAIT_TIMEOUT must be between 30 and 900 seconds."
}

validate_domain() {
  local domain_label
  local domain_labels
  [[ -n $lighthouse_domain ]] || fail "Set LIGHTHOUSE_DOMAIN."
  [[ $lighthouse_domain == *.* ]] || fail "LIGHTHOUSE_DOMAIN must be a public DNS name."
  [[ $lighthouse_domain != *'..'* ]] || fail "LIGHTHOUSE_DOMAIN contains an empty label."
  IFS='.' read -r -a domain_labels <<< "$lighthouse_domain"
  for domain_label in "${domain_labels[@]}"; do
    [[ ${#domain_label} -le 63 ]] || fail "LIGHTHOUSE_DOMAIN contains a label longer than 63 characters."
    [[ $domain_label =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]] ||
      fail "LIGHTHOUSE_DOMAIN is not a valid DNS name."
  done
}

validate_image() {
  local final_component
  local image_tag
  [[ -n $lighthouse_image ]] || fail "Set LIGHTHOUSE_IMAGE."
  [[ $lighthouse_image =~ ^[A-Za-z0-9._/@:-]+$ ]] ||
    fail "LIGHTHOUSE_IMAGE contains unsupported characters."
  if [[ $lighthouse_image =~ @sha256:[a-f0-9]{64}$ ]]; then
    return
  fi
  final_component=${lighthouse_image##*/}
  [[ $final_component == *:* ]] ||
    fail "LIGHTHOUSE_IMAGE must use an explicit tag or sha256 digest."
  image_tag=${final_component##*:}
  [[ -n $image_tag && $image_tag != "latest" ]] ||
    fail "LIGHTHOUSE_IMAGE must not use latest."
}

validate_maintenance_image() {
  local final_component
  local image_tag
  [[ $lighthouse_maintenance_image =~ ^[A-Za-z0-9._/@:-]+$ ]] ||
    fail "LIGHTHOUSE_MAINTENANCE_IMAGE contains unsupported characters."
  if [[ $lighthouse_maintenance_image =~ @sha256:[a-f0-9]{64}$ ]]; then
    return
  fi
  final_component=${lighthouse_maintenance_image##*/}
  [[ $final_component == *:* ]] ||
    fail "LIGHTHOUSE_MAINTENANCE_IMAGE must use an explicit version tag or sha256 digest."
  image_tag=${final_component##*:}
  [[ -n $image_tag && $image_tag != "latest" ]] ||
    fail "LIGHTHOUSE_MAINTENANCE_IMAGE must not use latest."
}

cleanup_paths=()
cleanup() {
  local cleanup_path
  set +u
  for cleanup_path in "${cleanup_paths[@]}"; do
    if [[ -n $cleanup_path && -d $cleanup_path && $cleanup_path == /tmp/* ]]; then
      rm -rf -- "$cleanup_path"
    fi
  done
  set -u
}
trap cleanup EXIT

lighthouse_ssh_target=${LIGHTHOUSE_SSH_TARGET:-tencent-lighthouse}
lighthouse_remote_root=${LIGHTHOUSE_REMOTE_ROOT:-/opt/agent-learning-hub}
lighthouse_domain=${LIGHTHOUSE_DOMAIN:-}
lighthouse_image=${LIGHTHOUSE_IMAGE:-}
lighthouse_env_file=${LIGHTHOUSE_ENV_FILE:-}
lighthouse_backup_env_file=${LIGHTHOUSE_BACKUP_ENV_FILE:-}
lighthouse_app_port=${LIGHTHOUSE_APP_PORT:-3000}
lighthouse_compose_project=${LIGHTHOUSE_COMPOSE_PROJECT:-agent-learning-hub-production}
lighthouse_wait_timeout=${LIGHTHOUSE_WAIT_TIMEOUT:-180}
lighthouse_maintenance_image=${LIGHTHOUSE_MAINTENANCE_IMAGE:-node:24.18.0-bookworm}
lighthouse_dry_run=${LIGHTHOUSE_DRY_RUN:-0}
lighthouse_allow_no_backup=${LIGHTHOUSE_ALLOW_NO_BACKUP:-0}
lighthouse_rollback_confirmed=${LIGHTHOUSE_ROLLBACK_CONFIRMED:-0}
lighthouse_allow_caddy_replace=${LIGHTHOUSE_ALLOW_CADDY_REPLACE:-0}
lighthouse_backup_host_path=/var/backups/agent-learning-hub
lighthouse_config_root=/etc/agent-learning-hub

ssh_options=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15)
ssh_command=(ssh "${ssh_options[@]}" "$lighthouse_ssh_target")
scp_command=(scp "${ssh_options[@]}")

remote_file_exists() {
  local remote_filename=$1
  "${ssh_command[@]}" sudo -n test -f "$remote_filename"
}

remote_current_exists() {
  "${ssh_command[@]}" sudo -n test -L "$lighthouse_remote_root/current"
}

run_preflight() {
  require_command ssh
  info "Checking SSH alias and dedicated Lighthouse host (read-only)"
  if enabled "$lighthouse_dry_run"; then
    printf '+ ssh %s <read-only preflight>\n' "$lighthouse_ssh_target"
    return
  fi
  "${ssh_command[@]}" bash -s <<'REMOTE'
set -Eeuo pipefail
printf 'host=%s\n' "$(hostname)"
printf 'kernel=%s\n' "$(uname -sr)"
printf 'architecture=%s\n' "$(uname -m)"
if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  printf 'os=%s %s\n' "$ID" "$VERSION_ID"
fi
sudo -n true
printf 'sudo=non-interactive\n'
df -Pk / | awk 'NR == 2 { printf "root_available_kib=%s\n", $4 }'
if command -v docker >/dev/null 2>&1; then
  printf 'docker=%s\n' "$(docker --version)"
  sudo -n docker info >/dev/null
  printf 'docker_daemon=ready\n'
else
  printf 'docker=not-installed\n'
fi
if command -v caddy >/dev/null 2>&1; then
  printf 'caddy=%s\n' "$(caddy version)"
else
  printf 'caddy=not-installed\n'
fi
REMOTE
}

run_bootstrap() {
  require_command ssh
  info "Bootstrapping Docker, Compose, Caddy, and production directories"
  if enabled "$lighthouse_dry_run"; then
    printf '+ ssh %s <Ubuntu bootstrap using official apt repositories>\n' "$lighthouse_ssh_target"
    return
  fi
  "${ssh_command[@]}" bash -s -- "$lighthouse_remote_root" "$lighthouse_config_root" "$lighthouse_backup_host_path" <<'REMOTE'
set -Eeuo pipefail
remote_root=$1
config_root=$2
backup_root=$3
managed_marker='# Managed by Agent Learning Hub lighthouse-deploy.sh'

sudo -n true
. /etc/os-release
[[ $ID == ubuntu ]] || { printf '%s\n' 'Only Ubuntu is supported by this bootstrap.' >&2; exit 1; }
case "$VERSION_ID" in
  22.04|24.04) ;;
  *) printf 'Unsupported Ubuntu version: %s\n' "$VERSION_ID" >&2; exit 1 ;;
esac
[[ $(uname -m) == x86_64 ]] || {
  printf '%s\n' 'The current release workflow publishes amd64 images; use an x86_64 instance.' >&2
  exit 1
}

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https

if dpkg-query -W -f='${Status}' docker.io 2>/dev/null | grep -q 'install ok installed'; then
  printf '%s\n' 'The distribution docker.io package is installed; review and remove it manually first.' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  conflicting_packages=""
  for package_name in docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package_name" 2>/dev/null | grep -q 'install ok installed'; then
      conflicting_packages="$conflicting_packages $package_name"
    fi
  done
  if [[ -n $conflicting_packages ]]; then
    printf 'Conflicting container packages are installed:%s\n' "$conflicting_packages" >&2
    printf '%s\n' 'Review and remove them manually before rerunning bootstrap.' >&2
    exit 1
  fi
  sudo install -m 0755 -d /etc/apt/keyrings
  docker_key=$(mktemp)
  trap 'rm -f "$docker_key" "${caddy_key:-}" "${caddy_source:-}"' EXIT
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$docker_key"
  sudo install -m 0644 "$docker_key" /etc/apt/keyrings/docker.asc
  architecture=$(dpkg --print-architecture)
  codename=${UBUNTU_CODENAME:-$VERSION_CODENAME}
  printf '%s\n' \
    'Types: deb' \
    'URIs: https://download.docker.com/linux/ubuntu' \
    "Suites: $codename" \
    'Components: stable' \
    "Architectures: $architecture" \
    'Signed-By: /etc/apt/keyrings/docker.asc' |
    sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

caddy_installed_here=0
if ! command -v caddy >/dev/null 2>&1; then
  caddy_key=$(mktemp)
  caddy_source=$(mktemp)
  trap 'rm -f "${docker_key:-}" "$caddy_key" "$caddy_source"' EXIT
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$caddy_key"
  sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg "$caddy_key"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o "$caddy_source"
  sudo install -m 0644 "$caddy_source" /etc/apt/sources.list.d/caddy-stable.list
  sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update
  sudo apt-get install -y caddy
  caddy_installed_here=1
fi

if [[ $caddy_installed_here == 1 ]]; then
  marked_caddyfile=$(mktemp)
  trap 'rm -f "${docker_key:-}" "${caddy_key:-}" "${caddy_source:-}" "$marked_caddyfile"' EXIT
  printf '%s\n' "$managed_marker" > "$marked_caddyfile"
  sudo cat /etc/caddy/Caddyfile >> "$marked_caddyfile"
  sudo install -m 0644 -o root -g root "$marked_caddyfile" /etc/caddy/Caddyfile
fi

sudo install -d -m 0755 -o root -g root "$remote_root" "$remote_root/releases"
sudo install -d -m 0700 -o root -g root "$config_root" "$backup_root"
sudo systemctl enable --now docker caddy
sudo docker info >/dev/null
sudo docker compose version
caddy version
REMOTE
}

upload_sensitive_file() {
  local local_filename=$1
  local remote_filename=$2
  local remote_temporary
  if enabled "$lighthouse_dry_run"; then
    printf '+ upload <redacted:%s> to %s:%s mode 600 root:root\n' \
      "$(basename -- "$local_filename")" "$lighthouse_ssh_target" "$remote_filename"
    return
  fi
  remote_temporary=$("${ssh_command[@]}" mktemp /tmp/agent-learning-hub-secret.XXXXXX)
  [[ $remote_temporary == /tmp/agent-learning-hub-secret.* ]] ||
    fail "Unexpected remote temporary path."
  if ! "${scp_command[@]}" -q "$local_filename" "$lighthouse_ssh_target:$remote_temporary"; then
    "${ssh_command[@]}" rm -f "$remote_temporary" || true
    fail "Secret upload failed."
  fi
  "${ssh_command[@]}" bash -s -- "$remote_temporary" "$remote_filename" <<'REMOTE'
set -Eeuo pipefail
temporary_file=$1
destination=$2
trap 'rm -f "$temporary_file"' EXIT
sudo -n install -m 0600 -o root -g root "$temporary_file" "$destination"
REMOTE
}

configure_remote_secrets() {
  local sanitized_environment
  local sanitized_backup_environment
  validate_domain
  [[ -n $lighthouse_env_file ]] || fail "Set LIGHTHOUSE_ENV_FILE for configure."
  validate_application_environment "$lighthouse_env_file"
  sanitized_environment=$(mktemp -d /tmp/agent-learning-hub-env.XXXXXX)
  cleanup_paths+=("$sanitized_environment")
  umask 077
  awk '
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
      key=$0
      sub(/=.*/, "", key)
      if (key == "BETTER_AUTH_SECRET" || key == "BETTER_AUTH_URL" ||
          key == "GITHUB_CLIENT_ID" || key == "GITHUB_CLIENT_SECRET" ||
          key == "ADMIN_GITHUB_IDS" || key == "STATE_VOLUME_NAME") print
      next
    }
    /^[[:space:]]*(#|$)/ { print }
  ' "$lighthouse_env_file" > "$sanitized_environment/application.env"
  upload_sensitive_file "$sanitized_environment/application.env" \
    "$lighthouse_config_root/application.env"

  if [[ -n $lighthouse_backup_env_file ]]; then
    validate_backup_environment "$lighthouse_backup_env_file"
    sanitized_backup_environment=$(mktemp -d /tmp/agent-learning-hub-backup-env.XXXXXX)
    cleanup_paths+=("$sanitized_backup_environment")
    grep -E '^BACKUP_PASSPHRASE=' "$lighthouse_backup_env_file" > \
      "$sanitized_backup_environment/backup.env"
    upload_sensitive_file "$sanitized_backup_environment/backup.env" \
      "$lighthouse_config_root/backup.env"
  fi
  info "Remote secrets configured without printing their values"
}

configure_backup_secret_if_requested() {
  local sanitized_backup_environment
  if [[ -z $lighthouse_backup_env_file ]]; then
    return
  fi
  validate_backup_environment "$lighthouse_backup_env_file"
  sanitized_backup_environment=$(mktemp -d /tmp/agent-learning-hub-backup-env.XXXXXX)
  cleanup_paths+=("$sanitized_backup_environment")
  umask 077
  grep -E '^BACKUP_PASSPHRASE=' "$lighthouse_backup_env_file" > \
    "$sanitized_backup_environment/backup.env"
  upload_sensitive_file "$sanitized_backup_environment/backup.env" \
    "$lighthouse_config_root/backup.env"
}

build_release_bundle() {
  local bundle_root=$1
  local git_revision=$2
  mkdir -p "$bundle_root/code/docker" "$bundle_root/code/scripts"
  cp "$application_root/package.json" "$application_root/package-lock.json" \
    "$application_root/tsconfig.json" "$bundle_root/code/"
  if [[ -f $application_root/.npmrc ]]; then
    cp "$application_root/.npmrc" "$bundle_root/code/.npmrc"
  fi
  cp -R "$application_root/modules" "$bundle_root/code/modules"
  cp "$application_root/scripts/database.ts" "$bundle_root/code/scripts/database.ts"
  # The drill shells out to the db:backup / db:restore npm scripts, so it has to
  # travel with them: a release whose backups cannot be proven restorable on the
  # host itself is the state GATE-07 exists to prevent.
  cp "$application_root/scripts/restore-drill.ts" "$bundle_root/code/scripts/restore-drill.ts"
  cp "$application_root/scripts/docker-deploy.sh" "$bundle_root/code/scripts/docker-deploy.sh"
  cp "$application_root/docker/Dockerfile" "$bundle_root/code/docker/Dockerfile"
  cp "$application_root/docker/docker-compose.yml" \
    "$application_root/docker/docker-compose.cloud.yml" \
    "$application_root/docker/docker-compose.release.yml" \
    "$application_root/docker/docker-compose.production.yml" \
    "$bundle_root/code/docker/"
  chmod 0755 "$bundle_root/code/scripts/docker-deploy.sh"
  printf 'git_revision=%s\nimage=%s\nstaged_at=%s\n' \
    "$git_revision" "$lighthouse_image" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > \
    "$bundle_root/DEPLOYMENT-METADATA"
}

run_remote_backup() {
  info "Creating an application-native encrypted SQLite backup before mutation"
  if enabled "$lighthouse_dry_run"; then
    printf '+ ssh %s <online SQLite backup into %s>\n' \
      "$lighthouse_ssh_target" "$lighthouse_backup_host_path"
    return
  fi
  remote_file_exists "$lighthouse_config_root/backup.env" ||
    fail "Remote backup secret is missing; configure LIGHTHOUSE_BACKUP_ENV_FILE first."
  remote_current_exists || fail "No deployed release is available to run the backup tooling."
  "${ssh_command[@]}" bash -s -- \
    "$lighthouse_remote_root" \
    "$lighthouse_config_root" \
    "$lighthouse_backup_host_path" \
    "$lighthouse_compose_project" \
    "$lighthouse_maintenance_image" <<'REMOTE'
set -Eeuo pipefail
remote_root=$1
config_root=$2
backup_root=$3
compose_project=$4
maintenance_image=$5
current_release=$(sudo -n readlink -f "$remote_root/current")
[[ -n $current_release && -d $current_release ]] || { printf '%s\n' 'Current release is missing.' >&2; exit 1; }

state_volume=$(sudo -n awk -F= '$1 == "STATE_VOLUME_NAME" { print substr($0, index($0, "=") + 1) }' \
  "$current_release/.env" | tail -n 1)
[[ $state_volume =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || {
  printf '%s\n' 'Current release has an invalid STATE_VOLUME_NAME.' >&2
  exit 1
}
sudo -n docker volume inspect "$state_volume" >/dev/null

tool_cache="${compose_project}-maintenance-node-modules"
sudo -n docker run --rm --pull=missing \
  --mount "type=bind,src=$current_release,dst=/workspace,readonly" \
  --mount "type=volume,src=$state_volume,dst=/data/state,readonly" \
  --mount "type=bind,src=$backup_root,dst=/secure/backups" \
  --mount "type=volume,src=$tool_cache,dst=/workspace/code/node_modules" \
  --env-file "$config_root/backup.env" \
  --env STATE_DATABASE_PATH=/data/state/learning-state.sqlite \
  --env BACKUP_OUTPUT_DIR=/secure/backups \
  --workdir /workspace \
  "$maintenance_image" \
  bash -lc '
    set -Eeuo pipefail
    expected_hash=$(sha256sum code/package-lock.json | cut -d " " -f 1)
    installed_hash=$(cat code/node_modules/.agent-learning-lock 2>/dev/null || true)
    if [[ $installed_hash != "$expected_hash" ]]; then
      npm ci --prefix code
      printf "%s\n" "$expected_hash" > code/node_modules/.agent-learning-lock
    fi
    npm run db:backup --prefix code
  '
REMOTE
}

run_remote_restore_drill() {
  info "Proving the production backup restores into a clean environment (GATE-07)"
  if enabled "$lighthouse_dry_run"; then
    printf '+ ssh %s <back up %s, restore into a throwaway location, verify>\n' \
      "$lighthouse_ssh_target" "$lighthouse_backup_host_path"
    return
  fi
  remote_file_exists "$lighthouse_config_root/backup.env" ||
    fail "Remote backup secret is missing; configure LIGHTHOUSE_BACKUP_ENV_FILE first."
  remote_current_exists || fail "No deployed release is available to run the drill tooling."
  "${ssh_command[@]}" bash -s -- \
    "$lighthouse_remote_root" \
    "$lighthouse_config_root" \
    "$lighthouse_backup_host_path" \
    "$lighthouse_compose_project" \
    "$lighthouse_maintenance_image" <<'REMOTE'
set -Eeuo pipefail
remote_root=$1
config_root=$2
backup_root=$3
compose_project=$4
maintenance_image=$5
current_release=$(sudo -n readlink -f "$remote_root/current")
[[ -n $current_release && -d $current_release ]] || { printf '%s\n' 'Current release is missing.' >&2; exit 1; }

state_volume=$(sudo -n awk -F= '$1 == "STATE_VOLUME_NAME" { print substr($0, index($0, "=") + 1) }' \
  "$current_release/.env" | tail -n 1)
[[ $state_volume =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || {
  printf '%s\n' 'Current release has an invalid STATE_VOLUME_NAME.' >&2
  exit 1
}
sudo -n docker volume inspect "$state_volume" >/dev/null

# The drill needs somewhere writable for its evidence; the release bundle is
# mounted read-only on purpose so a drill can never mutate the deployed tree.
sudo -n install -d -m 0700 "$backup_root/restore-drill"

tool_cache="${compose_project}-maintenance-node-modules"
sudo -n docker run --rm --pull=missing \
  --mount "type=bind,src=$current_release,dst=/workspace,readonly" \
  --mount "type=volume,src=$state_volume,dst=/data/state,readonly" \
  --mount "type=bind,src=$backup_root/restore-drill,dst=/secure/drill" \
  --mount "type=volume,src=$tool_cache,dst=/workspace/code/node_modules" \
  --env-file "$config_root/backup.env" \
  --workdir /workspace \
  "$maintenance_image" \
  bash -lc '
    set -Eeuo pipefail
    expected_hash=$(sha256sum code/package-lock.json | cut -d " " -f 1)
    installed_hash=$(cat code/node_modules/.agent-learning-lock 2>/dev/null || true)
    if [[ $installed_hash != "$expected_hash" ]]; then
      npm ci --prefix code
      printf "%s\n" "$expected_hash" > code/node_modules/.agent-learning-lock
    fi
    npm run drill:restore --prefix code -- \
      --source /data/state/learning-state.sqlite \
      --output-dir /secure/drill
  '
printf 'Drill evidence: %s/restore-drill/restore-drill.md\n' "$backup_root"
REMOTE
}

stage_and_deploy_release() {
  local bundle_directory
  local git_revision
  local release_slug
  local release_name
  local remote_staging
  require_command git
  require_command tar
  git_revision=$(git -C "$repository_root" rev-parse --verify HEAD)
  if [[ -n $(git -C "$repository_root" status --porcelain --untracked-files=normal) ]]; then
    if enabled "$lighthouse_dry_run"; then
      info "WARNING: dry-run sees a dirty worktree; a real production deploy will refuse it"
    else
      fail "Production deploy requires a clean Git worktree matching the intended release."
    fi
  fi
  release_slug=$(printf '%s' "$lighthouse_image" | tr -c 'A-Za-z0-9._-' '-')
  release_name="$(date -u +%Y%m%dT%H%M%SZ)-${release_slug}-${git_revision:0:12}"
  bundle_directory=$(mktemp -d /tmp/agent-learning-hub-release.XXXXXX)
  cleanup_paths+=("$bundle_directory")
  build_release_bundle "$bundle_directory" "$git_revision"

  if enabled "$lighthouse_dry_run"; then
    printf '+ stage release %s on %s:%s/releases/\n' \
      "$release_name" "$lighthouse_ssh_target" "$lighthouse_remote_root"
    printf '+ deploy pinned image %s behind https://%s\n' "$lighthouse_image" "$lighthouse_domain"
    return
  fi

  remote_staging=$("${ssh_command[@]}" mktemp -d /tmp/agent-learning-hub-release.XXXXXX)
  [[ $remote_staging == /tmp/agent-learning-hub-release.* ]] ||
    fail "Unexpected remote release staging path."
  tar -C "$bundle_directory" -czf - . |
    "${ssh_command[@]}" tar -xzf - -C "$remote_staging"

  "${ssh_command[@]}" bash -s -- \
    "$lighthouse_remote_root" \
    "$lighthouse_config_root" \
    "$lighthouse_backup_host_path" \
    "$remote_staging" \
    "$release_name" \
    "$lighthouse_domain" \
    "$lighthouse_image" \
    "$lighthouse_app_port" \
    "$lighthouse_compose_project" \
    "$lighthouse_wait_timeout" \
    "$lighthouse_allow_caddy_replace" <<'REMOTE'
set -Eeuo pipefail
remote_root=$1
config_root=$2
backup_root=$3
staging_root=$4
release_name=$5
domain=$6
image=$7
app_port=$8
compose_project=$9
wait_timeout=${10}
allow_caddy_replace=${11}
release_root="$remote_root/releases/$release_name"
managed_marker='# Managed by Agent Learning Hub lighthouse-deploy.sh'
candidate_link="$remote_root/candidate"
cleanup_remote() { rm -rf -- "$staging_root"; }
trap cleanup_remote EXIT

sudo -n true
sudo -n test -f "$config_root/application.env"
sudo -n test -d "$backup_root"
sudo -n test ! -e "$release_root"
sudo -n install -d -m 0755 -o root -g root "$release_root"
sudo -n cp -a "$staging_root/." "$release_root/"
sudo -n chown -R root:root "$release_root"
sudo -n chmod 0755 "$release_root/code/scripts/docker-deploy.sh"
sudo -n cp "$config_root/application.env" "$release_root/.env"
printf '%s\n' \
  "APP_IMAGE=$image" \
  'APP_BIND_HOST=127.0.0.1' \
  "APP_PORT=$app_port" \
  "BACKUP_HOST_PATH=$backup_root" |
  sudo -n tee -a "$release_root/.env" >/dev/null
if ! sudo -n grep -qE '^STATE_VOLUME_NAME=' "$release_root/.env"; then
  printf 'STATE_VOLUME_NAME=%s-state\n' "$compose_project" |
    sudo -n tee -a "$release_root/.env" >/dev/null
fi
sudo -n chmod 0600 "$release_root/.env"

extra_compose="$release_root/code/docker/docker-compose.production.yml"
cd "$release_root"
sudo -n env COMPOSE_PROJECT_NAME="$compose_project" \
  docker compose --env-file .env \
  -f code/docker/docker-compose.yml \
  -f code/docker/docker-compose.cloud.yml \
  -f code/docker/docker-compose.release.yml \
  -f "$extra_compose" config --quiet

if sudo -n test -s /etc/caddy/Caddyfile &&
  ! sudo -n grep -qF "$managed_marker" /etc/caddy/Caddyfile &&
  [[ $allow_caddy_replace != 1 ]]; then
  printf '%s\n' 'Refusing to replace an unmarked /etc/caddy/Caddyfile.' >&2
  printf '%s\n' 'Integrate the site manually or set LIGHTHOUSE_ALLOW_CADDY_REPLACE=1 on a dedicated host.' >&2
  exit 1
fi
caddy_candidate=$(mktemp)
trap 'rm -f "$caddy_candidate"; cleanup_remote' EXIT
printf '%s\n' \
  "$managed_marker" \
  "$domain {" \
  '  encode zstd gzip' \
  "  reverse_proxy 127.0.0.1:$app_port" \
  '}' > "$caddy_candidate"
sudo -n caddy validate --config "$caddy_candidate" --adapter caddyfile

sudo -n ln -sfn "$release_root" "$candidate_link"
sudo -n env \
  COMPOSE_PROJECT_NAME="$compose_project" \
  COMPOSE_EXTRA_FILES="$extra_compose" \
  WAIT_TIMEOUT="$wait_timeout" \
  "$release_root/code/scripts/docker-deploy.sh" release up

sudo -n install -m 0644 -o root -g root "$caddy_candidate" /etc/caddy/Caddyfile
sudo -n systemctl reload caddy

previous_release=$(sudo -n readlink -f "$remote_root/current" 2>/dev/null || true)
if [[ -n $previous_release && -d $previous_release && $previous_release != "$release_root" ]]; then
  sudo -n ln -sfn "$previous_release" "$remote_root/previous"
fi
sudo -n ln -sfn "$release_root" "$remote_root/current"
sudo -n rm -f "$candidate_link"
printf 'active_release=%s\n' "$release_root"
REMOTE
}

verify_public_endpoint() {
  local health_response
  local redirect_status
  require_command curl
  info "Verifying public HTTPS and HTTP redirect"
  if enabled "$lighthouse_dry_run"; then
    printf '+ curl --fail https://%s/api/health\n' "$lighthouse_domain"
    printf '+ curl http://%s/  # expect redirect\n' "$lighthouse_domain"
    return
  fi
  health_response=$(curl --fail --silent --show-error \
    --retry 8 --retry-delay 3 --retry-all-errors \
    "https://$lighthouse_domain/api/health")
  printf '%s\n' "$health_response" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' ||
    fail "Public health response did not report status=ok."
  printf '%s\n' "$health_response" | grep -Eq '"mode"[[:space:]]*:[[:space:]]*"cloud"' ||
    fail "Public health response did not report cloud mode."
  redirect_status=$(curl --silent --show-error --output /dev/null \
    --write-out '%{http_code}' "http://$lighthouse_domain/")
  case "$redirect_status" in
    301|302|307|308) ;;
    *) fail "HTTP did not redirect to HTTPS (status $redirect_status)." ;;
  esac
  printf '%s\n' "$health_response"
}

run_current_release_action() {
  local helper_action=$1
  if enabled "$lighthouse_dry_run"; then
    printf '+ ssh %s <current release %s>\n' "$lighthouse_ssh_target" "$helper_action"
    return
  fi
  "${ssh_command[@]}" bash -s -- \
    "$lighthouse_remote_root" "$lighthouse_compose_project" "$helper_action" <<'REMOTE'
set -Eeuo pipefail
remote_root=$1
compose_project=$2
helper_action=$3
current_release=$(sudo -n readlink -f "$remote_root/current")
extra_compose="$current_release/code/docker/docker-compose.production.yml"
sudo -n env COMPOSE_PROJECT_NAME="$compose_project" COMPOSE_EXTRA_FILES="$extra_compose" \
  "$current_release/code/scripts/docker-deploy.sh" release "$helper_action"
REMOTE
}

run_status() {
  info "Showing production status"
  run_current_release_action status
  if enabled "$lighthouse_dry_run"; then
    return
  fi
  "${ssh_command[@]}" bash -s -- "$lighthouse_remote_root" "$lighthouse_backup_host_path" <<'REMOTE'
set -Eeuo pipefail
remote_root=$1
backup_root=$2
printf 'current=%s\n' "$(sudo -n readlink -f "$remote_root/current")"
printf 'previous=%s\n' "$(sudo -n readlink -f "$remote_root/previous" 2>/dev/null || true)"
printf 'caddy=%s\n' "$(systemctl is-active caddy 2>/dev/null || true)"
sudo -n du -sh "$backup_root"
df -h / "$backup_root"
REMOTE
}

run_rollback() {
  validate_domain
  enabled "$lighthouse_rollback_confirmed" ||
    fail "Set LIGHTHOUSE_ROLLBACK_CONFIRMED=1 after reviewing database compatibility."
  configure_backup_secret_if_requested
  if enabled "$lighthouse_allow_no_backup"; then
    info "WARNING: break-glass rollback is proceeding without a new backup"
  else
    run_remote_backup
  fi
  info "Rolling back only the application image to the previous release"
  if enabled "$lighthouse_dry_run"; then
    printf '+ ssh %s <start previous release and swap release pointers>\n' "$lighthouse_ssh_target"
  else
    "${ssh_command[@]}" bash -s -- \
      "$lighthouse_remote_root" "$lighthouse_compose_project" "$lighthouse_wait_timeout" <<'REMOTE'
set -Eeuo pipefail
remote_root=$1
compose_project=$2
wait_timeout=$3
current_release=$(sudo -n readlink -f "$remote_root/current")
previous_release=$(sudo -n readlink -f "$remote_root/previous")
[[ -d $previous_release ]] || { printf '%s\n' 'Previous release is missing.' >&2; exit 1; }
current_volume=$(sudo -n awk -F= '$1 == "STATE_VOLUME_NAME" { print substr($0, index($0, "=") + 1) }' \
  "$current_release/.env" | tail -n 1)
previous_volume=$(sudo -n awk -F= '$1 == "STATE_VOLUME_NAME" { print substr($0, index($0, "=") + 1) }' \
  "$previous_release/.env" | tail -n 1)
[[ -n $current_volume && $current_volume == "$previous_volume" ]] || {
  printf '%s\n' 'Current and previous releases reference different state volumes; use the manual recovery runbook.' >&2
  exit 1
}
extra_compose="$previous_release/code/docker/docker-compose.production.yml"
sudo -n env \
  COMPOSE_PROJECT_NAME="$compose_project" \
  COMPOSE_EXTRA_FILES="$extra_compose" \
  WAIT_TIMEOUT="$wait_timeout" \
  "$previous_release/code/scripts/docker-deploy.sh" release up
sudo -n ln -sfn "$current_release" "$remote_root/previous"
sudo -n ln -sfn "$previous_release" "$remote_root/current"
printf 'active_release=%s\n' "$previous_release"
REMOTE
  fi
  verify_public_endpoint
}

action=${1:-}
if [[ -z $action || $action == "-h" || $action == "--help" || $action == "help" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

validate_common_configuration
validate_maintenance_image
require_command ssh

case "$action" in
  preflight)
    run_preflight
    ;;
  bootstrap)
    run_preflight
    run_bootstrap
    ;;
  configure)
    require_command scp
    run_preflight
    configure_remote_secrets
    ;;
  deploy)
    require_command scp
    validate_domain
    validate_image
    run_preflight
    if [[ -n $lighthouse_env_file ]]; then
      configure_remote_secrets
    else
      configure_backup_secret_if_requested
    fi
    if enabled "$lighthouse_dry_run"; then
      info "Dry-run assumes remote application secrets and first/upgrade state are valid"
    elif remote_current_exists; then
      if enabled "$lighthouse_allow_no_backup"; then
        info "WARNING: break-glass deployment is proceeding without a pre-deploy backup"
      else
        run_remote_backup
      fi
    fi
    stage_and_deploy_release
    verify_public_endpoint
    ;;
  backup)
    require_command scp
    run_preflight
    configure_backup_secret_if_requested
    run_remote_backup
    ;;
  restore-drill)
    require_command scp
    run_preflight
    configure_backup_secret_if_requested
    run_remote_restore_drill
    ;;
  rollback)
    require_command scp
    run_preflight
    run_rollback
    ;;
  verify)
    validate_domain
    run_current_release_action verify
    verify_public_endpoint
    ;;
  status)
    run_status
    ;;
  logs)
    run_current_release_action logs
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
