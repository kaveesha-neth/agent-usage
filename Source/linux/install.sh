#!/usr/bin/env bash
set -euo pipefail

bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
uuid='codex-usage@agent-usage'
data_dir=${XDG_DATA_HOME:-}
if [[ "$data_dir" != /* ]]; then
    data_dir="$HOME/.local/share"
fi
bin_dir="$data_dir/codex-usage-widget/bin"

if [[ $(uname -m) != x86_64 ]]; then
    printf 'This release requires x86-64 Linux.\n' >&2
    exit 1
fi
if ! command -v gnome-extensions >/dev/null; then
    printf 'Install GNOME Shell 50 and its gnome-extensions CLI first.\n' >&2
    exit 1
fi

gnome-extensions install --force "$bundle/$uuid.shell-extension.zip"
install -d -- "$bin_dir"
helper_tmp=$(mktemp "$bin_dir/.codex-usage-helper.XXXXXX")
trap 'rm -f -- "$helper_tmp"' EXIT
install -m 755 -- "$bundle/codex-usage-helper" "$helper_tmp"
mv -f -- "$helper_tmp" "$bin_dir/codex-usage-helper"
printf 'Installed Codex Usage. Enable with: gnome-extensions enable %s\n' "$uuid"
printf 'If GNOME has not discovered the extension yet, log out and back in first.\n'
