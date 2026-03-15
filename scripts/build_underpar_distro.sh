#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="${1:-underpar_distro.zip}"

if [[ "$output_path" != /* ]]; then
  output_path="$repo_root/$output_path"
fi

cd "$repo_root"
rm -f "$output_path"

files=()
while IFS= read -r -d '' file; do
  case "$file" in
    *.zip|.DS_Store|*/.DS_Store)
      continue
      ;;
  esac
  [[ -e "$file" ]] || continue
  files+=("$file")
done < <(git ls-files -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No repository files available to package." >&2
  exit 1
fi

zip -q "$output_path" "${files[@]}"
printf '%s\n' "$output_path"
