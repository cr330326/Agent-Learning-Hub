#!/usr/bin/env bash
# Build the production image from the current workspace and publish it to the
# registry, so a cloud host can run a pinned digest it did not build itself.
set -Eeuo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
application_root=$(cd -- "$script_dir/.." && pwd -P)
repository_root=$(cd -- "$application_root/.." && pwd -P)
dockerfile="$application_root/docker/Dockerfile"

default_repository="ghcr.io/cr330326/agent-learning-hub"

usage() {
  cat <<'EOF'
Usage: code/scripts/image-release.sh [options] <version>

Builds code/docker/Dockerfile from the repository root and, with --push,
publishes it. Prints the immutable sha256 reference to pin in LIGHTHOUSE_IMAGE
or APP_IMAGE, plus the exact deploy command to run next.

Arguments:
  <version>   Release version such as v0.1.0. "latest" is rejected: production
              Compose and the deploy runbooks require a fixed tag or digest.

Options:
  --push               Publish to the registry. Run "docker login <registry>"
                       yourself first; this script never handles credentials.
  --repository REPO    Image repository (default: $IMAGE_REPOSITORY, else
                       ghcr.io/cr330326/agent-learning-hub).
  --platform PLATFORM  Target platform (default: linux/amd64). Cloud hosts are
                       x86_64, so an arm64 developer machine must cross-build.
  --allow-overwrite    Push even when <version> already exists in the registry.
  --dry-run            Print the docker commands without running them.
  -h, --help           Show this help.

Pushing a v*.*.* git tag runs .github/workflows/release.yml, which builds the
same Dockerfile and additionally attaches SBOM and signed provenance. Prefer
that for anything real; this script is the manual path for a registry or a host
that CI cannot reach.
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '==> %s\n' "$*"
}

version=""
repository=${IMAGE_REPOSITORY:-$default_repository}
platform="linux/amd64"
push=0
allow_overwrite=0
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      push=1
      shift
      ;;
    --repository)
      repository=${2:-}
      [[ -n $repository ]] || fail "--repository expects a value."
      shift 2
      ;;
    --platform)
      platform=${2:-}
      [[ -n $platform ]] || fail "--platform expects a value."
      shift 2
      ;;
    --allow-overwrite)
      allow_overwrite=1
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      usage >&2
      exit 2
      ;;
    *)
      [[ -z $version ]] || fail "Only one version may be given."
      version=$1
      shift
      ;;
  esac
done

[[ -n $version ]] || {
  usage >&2
  exit 2
}

if [[ $version == "latest" || $version == *:latest ]]; then
  fail 'Release images must be pinned; "latest" is not deployable.'
fi

[[ -f $dockerfile ]] || fail "Dockerfile is missing: $dockerfile"

command -v docker >/dev/null 2>&1 || fail "Docker CLI is required."
if [[ $dry_run -ne 1 ]]; then
  docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable."
  docker buildx version >/dev/null 2>&1 ||
    fail "docker buildx is required to build for $platform."
fi

reference="$repository:$version"

run() {
  if [[ $dry_run -eq 1 ]]; then
    printf '%q ' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

# An image built from uncommitted work matches no commit anyone can check out,
# which is exactly what a pinned production reference is supposed to rule out.
commit="unknown"
if git -C "$repository_root" rev-parse --git-dir >/dev/null 2>&1; then
  commit=$(git -C "$repository_root" rev-parse --short HEAD)
  if [[ -n $(git -C "$repository_root" status --porcelain) ]]; then
    printf 'WARNING: the working tree is dirty; %s will not match commit %s.\n' \
      "$reference" "$commit" >&2
  fi
fi

if [[ $push -eq 1 && $allow_overwrite -ne 1 && $dry_run -ne 1 ]]; then
  if docker buildx imagetools inspect "$reference" >/dev/null 2>&1; then
    fail "$reference already exists in the registry. Pick a new version, or pass --allow-overwrite to replace a release other hosts may already be running."
  fi
fi

metadata_file=""
cleanup() {
  [[ -n $metadata_file && -f $metadata_file ]] && rm -f "$metadata_file"
  return 0
}
trap cleanup EXIT

build_args=(
  buildx build
  --file "$dockerfile"
  --platform "$platform"
  --build-arg "APP_VERSION=$version"
  --tag "$reference"
)

if [[ $push -eq 1 ]]; then
  metadata_file=$(mktemp -t alh-image-metadata)
  build_args+=(--push --metadata-file "$metadata_file")
  info "Building and pushing $reference for $platform"
else
  # A single-platform build can be loaded into the local daemon; that is what
  # makes the artifact runnable locally before anyone publishes it.
  build_args+=(--load)
  info "Building $reference for $platform (not pushing)"
fi

build_args+=("$repository_root")
run docker "${build_args[@]}"

if [[ $dry_run -eq 1 ]]; then
  exit 0
fi

registry_host=""
case "${repository%%/*}" in
  *.* | *:*) registry_host=${repository%%/*} ;;
  *) registry_host="<registry>" ;;
esac

if [[ $push -ne 1 ]]; then
  cat <<EOF

Built locally: $reference (commit $commit, platform $platform)
Run it with the release Compose files:
  APP_IMAGE=$reference code/scripts/docker-deploy.sh release up
Publish it when you are satisfied:
  docker login $registry_host
  code/scripts/image-release.sh --push $version

On an Apple Silicon machine a $platform image runs under emulation, so treat a
local run as a smoke test of the artifact, not as a performance measurement.
EOF
  exit 0
fi

digest=""
if [[ -f $metadata_file ]]; then
  # Extracted with sed rather than a JSON parser so the script stays runnable on
  # a release machine that has Docker but no Node toolchain.
  digest=$(
    sed -n \
      's/.*"containerimage\.digest"[[:space:]]*:[[:space:]]*"\(sha256:[0-9a-f]\{64\}\)".*/\1/p' \
      "$metadata_file" | head -1
  )
fi

if [[ -z $digest ]]; then
  printf 'WARNING: could not read the pushed digest; resolve it with:\n' >&2
  printf '  docker buildx imagetools inspect %s\n' "$reference" >&2
  pinned="$reference"
else
  pinned="$repository@$digest"
fi

cat <<EOF

Published: $reference (commit $commit, platform $platform)
Pin this immutable reference:
  $pinned

Deploy it to the Lighthouse host:
  export LIGHTHOUSE_DOMAIN=<your-domain>
  export LIGHTHOUSE_IMAGE=$pinned
  code/scripts/lighthouse-deploy.sh deploy
  code/scripts/lighthouse-deploy.sh verify

The script did not create DNS records, firewall rules, snapshots, or off-host
backups. Finish those from docs/deploy/ before calling the release production-ready.
EOF
