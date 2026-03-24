#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'USAGE'
Usage: publish_get_latest_release.sh --message "<commit message>" [--remote origin] [--branch main]

Publishes the current UnderPAR workspace for Get Latest validation by:
  1. bumping the manifest version
  2. rebuilding underpar_distro.zip and underpar_distro.version.json
  3. staging all changes
  4. creating a git commit
  5. pushing to the target branch

Notes:
  - The default publish target is origin/main because Get Latest reads GitHub main.
  - The current local branch must match the target branch.
USAGE
}

MESSAGE=""
REMOTE="origin"
BRANCH="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message|-m)
      [[ $# -ge 2 ]] || { echo "error: --message requires a value" >&2; exit 1; }
      MESSAGE="$2"
      shift 2
      ;;
    --remote)
      [[ $# -ge 2 ]] || { echo "error: --remote requires a value" >&2; exit 1; }
      REMOTE="$2"
      shift 2
      ;;
    --branch)
      [[ $# -ge 2 ]] || { echo "error: --branch requires a value" >&2; exit 1; }
      BRANCH="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

MESSAGE="$(printf '%s' "$MESSAGE" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
REMOTE="$(printf '%s' "$REMOTE" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
BRANCH="$(printf '%s' "$BRANCH" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

if [[ -z "$MESSAGE" ]]; then
  echo "error: --message is required" >&2
  usage
  exit 1
fi

if [[ -z "$REMOTE" || -z "$BRANCH" ]]; then
  echo "error: --remote and --branch must be non-empty" >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "error: unable to determine current branch" >&2
  exit 1
fi

if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  echo "error: publish target is ${REMOTE}/${BRANCH}, but current branch is ${CURRENT_BRANCH}. Switch to ${BRANCH} before publishing Get Latest." >&2
  exit 1
fi

if [[ -n "$(git status --short --untracked-files=no)" ]]; then
  :
else
  echo "error: no tracked workspace changes to publish" >&2
  exit 1
fi

"$ROOT/scripts/auto_bump_manifest_version.sh"
"$ROOT/scripts/build_underpar_distro.sh" >/dev/null

git add -A

if git diff --cached --quiet; then
  echo "error: nothing is staged after build and version sync" >&2
  exit 1
fi

git commit -m "$MESSAGE"
git push "$REMOTE" "$BRANCH"

printf 'Published Get Latest update to %s/%s\n' "$REMOTE" "$BRANCH"
