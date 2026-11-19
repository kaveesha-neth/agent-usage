#!/usr/bin/env bash
set -euo pipefail

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
repo_dir=$(dirname -- "$source_dir")
output="$source_dir/artifacts/linux-x64"
stage=$(mktemp -d "${TMPDIR:-/tmp}/codex-usage-build.XXXXXX")
trap 'rm -r -- "$stage"' EXIT
bundle="$stage/codex-usage-linux-x64"
mkdir -p -- "$bundle/Notices" "$output"

dotnet run --project "$source_dir/tests/CodexUsage.Tests" -c Release
gjs -m "$source_dir/linux/tests/usage.js"
gjs -m "$source_dir/linux/tests/transport.js"
glib-compile-schemas --strict --dry-run "$source_dir/linux/gnome/schemas"
dotnet publish "$source_dir/src/CodexUsage.Linux" -c Release -r linux-x64 \
    --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
    -o "$stage/publish"
node "$source_dir/linux/tests/helper.mjs" "$stage/publish/codex-usage-helper"

gnome-extensions pack --extra-source=usage.js --extra-source=helper.js \
    --schema=schemas/org.gnome.shell.extensions.codex-usage.gschema.xml \
    --out-dir="$bundle" "$source_dir/linux/gnome"
install -m 755 -- "$stage/publish/codex-usage-helper" "$bundle/"
install -m 644 -- "$source_dir/linux/install.sh" "$source_dir/linux/README.md" "$repo_dir/LICENSE" "$bundle/"
install -m 644 -- "$repo_dir/Notices/DOTNET-LICENSE.txt" "$repo_dir/Notices/DOTNET-THIRD-PARTY-NOTICES.txt" "$bundle/Notices/"

tar -czf "$stage/codex-usage-linux-x64.tar.gz" -C "$stage" codex-usage-linux-x64
mv -- "$stage/codex-usage-linux-x64.tar.gz" "$output/"
(cd -- "$output" && sha256sum codex-usage-linux-x64.tar.gz > SHA256.txt)
printf 'Linux bundle: %s/codex-usage-linux-x64.tar.gz\n' "$output"
