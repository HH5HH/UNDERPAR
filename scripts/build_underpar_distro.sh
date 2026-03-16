#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="$repo_root/underpar_distro.zip"
archive_root_name="underpar-distro"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/underpar-distro.XXXXXX")"

cleanup() {
  rm -rf "$staging_dir"
}

trap cleanup EXIT

cd "$repo_root"
find "$repo_root" -maxdepth 1 -type f -name '*.zip' ! -name "$(basename "$output_path")" -delete
rm -f "$output_path"

mkdir -p "$staging_dir/$archive_root_name"

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

for file in "${files[@]}"; do
  mkdir -p "$staging_dir/$archive_root_name/$(dirname "$file")"
  cp "$file" "$staging_dir/$archive_root_name/$file"
done

(
  cd "$staging_dir"
  zip -q -r "$output_path" "$archive_root_name"
)

printf '%s\n' "$output_path"
