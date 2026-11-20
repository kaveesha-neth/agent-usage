#!/usr/bin/env bash
set -euo pipefail

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
repo_dir=$(dirname -- "$source_dir")
output="$source_dir/artifacts/linux-x64"
stage=$(mktemp -d "${TMPDIR:-/tmp}/codex-usage-build.XXXXXX")
trap 'rm -r -- "$stage"' EXIT
bundle="$stage/codex-usage-linux-x64"
mkdir -p -- "$bundle/Notices" "$output"

if [[ $(uname -sm) != 'Linux x86_64' ]]; then
    printf 'Build and verify this release on x86-64 Linux.\n' >&2
    exit 1
fi
gjs -m "$source_dir/linux/tests/usage.js"
gjs -m "$source_dir/linux/tests/transport.js"
glib-compile-schemas --strict --dry-run "$source_dir/linux/gnome/schemas"
(
    cd -- "$source_dir/linux/helper"
    export CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOAMD64=v1 GOTOOLCHAIN=local
    go test ./...
    go build -trimpath -ldflags='-s -w' -o "$bundle/codex-usage-helper" .
)
node "$source_dir/linux/tests/helper.mjs" "$bundle/codex-usage-helper"

go_root=$(GOTOOLCHAIN=local go env GOROOT)
if [[ -f "$go_root/LICENSE" ]]; then
    install -m 644 -- "$go_root/LICENSE" "$bundle/Notices/GO-LICENSE.txt"
    install -m 644 -- "$go_root/PATENTS" "$bundle/Notices/GO-PATENTS.txt"
else
    # Debian and Ubuntu put Go's license and third-party notices under share/doc.
    go_notices="$go_root/../../share/doc/golang-${go_root##*go-}-src/copyright"
    install -m 644 -- "$go_notices" "$bundle/Notices/GO-COPYRIGHT.txt"
fi

gnome-extensions pack --extra-source=usage.js --extra-source=helper.js \
    --schema=schemas/org.gnome.shell.extensions.codex-usage.gschema.xml \
    --out-dir="$bundle" "$source_dir/linux/gnome"
install -m 755 -- "$source_dir/linux/install.sh" "$bundle/"
install -m 644 -- "$source_dir/linux/README.md" "$repo_dir/LICENSE" "$bundle/"

tar -czf "$stage/codex-usage-linux-x64.tar.gz" -C "$stage" codex-usage-linux-x64
mv -- "$stage/codex-usage-linux-x64.tar.gz" "$output/"
(cd -- "$output" && sha256sum codex-usage-linux-x64.tar.gz > SHA256.txt)
printf 'Linux bundle: %s/codex-usage-linux-x64.tar.gz\n' "$output"
