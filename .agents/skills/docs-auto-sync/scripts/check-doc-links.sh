#!/usr/bin/env bash
# Validate repository-relative inline links in Markdown and MDX files.
set -uo pipefail

usage() {
  cat <<'EOF'
Usage: check-doc-links.sh [--root PATH] [--] [FILE ...]

Without FILE arguments, checks tracked Markdown/MDX files (or discovers them
under --root when Git metadata is unavailable). External URLs, root-relative
web routes, and anchor validity are outside this script's scope.
EOF
}

root_arg=""
files=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --root)
      [ "$#" -ge 2 ] || { printf '%s\n' 'Missing value for --root' >&2; exit 2; }
      root_arg=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do files+=("$1"); shift; done
      ;;
    -*)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
    *)
      files+=("$1")
      shift
      ;;
  esac
done

if [ -n "$root_arg" ]; then
  project_root=$(cd "$root_arg" 2>/dev/null && pwd) || {
    printf 'Cannot access --root: %s\n' "$root_arg" >&2
    exit 2
  }
else
  project_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
fi
cd "$project_root" || exit 2

if [ "${#files[@]}" -eq 0 ]; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    while IFS= read -r file; do files+=("$file"); done < <(
      git ls-files --cached --others --exclude-standard -- '*.md' '*.mdx'
    )
  else
    while IFS= read -r file; do
      files+=("${file#./}")
    done < <(find . -type f \( -name '*.md' -o -name '*.mdx' \) \
      -not -path '*/.git/*' \
      -not -path '*/node_modules/*' \
      -not -path '*/vendor/*' \
      -not -path '*/dist/*' \
      -not -path '*/build/*' \
      -not -path '*/.next/*' \
      -not -path '*/coverage/*')
  fi
fi

if [ "${#files[@]}" -eq 0 ]; then
  printf '%s\n' 'No Markdown or MDX files found.'
  exit 0
fi

if ! command -v rg >/dev/null 2>&1; then
  printf '%s\n' 'check-doc-links.sh requires ripgrep (rg).' >&2
  exit 2
fi

status=0
checked=0
for source in "${files[@]}"; do
  if [ ! -f "$source" ]; then
    printf 'File not found: %s\n' "$source" >&2
    status=1
    continue
  fi

  checked=$((checked + 1))
  source_dir=$(dirname -- "$source")
  while IFS= read -r raw_link; do
    target=${raw_link#']('}
    target=${target%')'}
    target=${target#<}
    target=${target%>}

    # Strip an optional Markdown link title without breaking angle-bracket paths.
    case "$target" in
      *' "'*) target=${target%%' "'*} ;;
      *" '") target=${target%%" '"*} ;;
    esac

    case "$target" in
      ''|'#'*|'http://'*|'https://'*|'mailto:'*|'tel:'*|'ftp://'*|'data:'*|'//'* )
        continue
        ;;
    esac

    path=${target%%#*}
    path=${path%%\?*}
    [ -z "$path" ] && continue

    # Root-relative paths are usually application routes, not repository files.
    case "$path" in /*) continue ;; esac

    resolved="$source_dir/$path"
    if [ ! -e "$resolved" ]; then
      printf 'Broken link: %s -> %s (resolved as %s)\n' "$source" "$target" "$resolved"
      status=1
    fi
  done < <(rg -o '\]\((<[^>]+>|[^)]*)\)' -- "$source" || true)
done

if [ "$status" -eq 0 ]; then
  printf 'Link path check passed: %s file(s).\n' "$checked"
fi
exit "$status"
