#!/usr/bin/env bash
set -euo pipefail

bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
uuid='codex-usage@agent-usage'
data_dir=${XDG_DATA_HOME:-}
if [[ "$data_dir" != /* ]]; then
    data_dir="$HOME/.local/share"
fi
bin_dir="$data_dir/codex-usage-widget/bin"
extension_dir="$data_dir/gnome-shell/extensions/$uuid"

if [[ $# -gt 1 || ( $# -eq 1 && $1 != --uninstall ) ]]; then
    printf 'Usage: ./install.sh [--uninstall]\n' >&2
    exit 2
fi
if (( EUID == 0 )); then
    printf 'Run as your regular desktop user, without sudo.\n' >&2
    exit 1
fi
if ! command -v gnome-extensions >/dev/null; then
    printf 'This package is for GNOME Shell 50. The GNOME Extensions tool was not found.\n' >&2
    exit 1
fi

forget_extension() {
    local key=$1 entries next entry="'$uuid'"
    if ! entries=$(gsettings get org.gnome.shell "$key" 2>/dev/null); then
        return 1
    fi
    case $entries in
        "[$entry]") next='[]' ;;
        *"$entry, "*) next=${entries/"$entry, "/} ;;
        *", $entry]" ) next=${entries/", $entry]"/]} ;;
        *) return 0 ;;
    esac
    gsettings set org.gnome.shell "$key" "$next" &&
        [[ $(gsettings get org.gnome.shell "$key") != *"$entry"* ]]
}

if [[ ${1:-} == --uninstall ]]; then
    if [[ -d "$extension_dir" ]]; then
        gnome-extensions disable --quiet "$uuid" || true
        gnome-extensions uninstall "$uuid"
    fi
    for key in enabled-extensions disabled-extensions; do
        if ! forget_extension "$key"; then
            printf 'Could not update the GNOME %s setting for this user.\n' "$key" >&2
        fi
    done
    rm -f -- "$bin_dir/codex-usage-helper"
    printf 'Removed Codex Usage. Preferences and cached quota were kept.\n'
    exit
fi

if [[ $(uname -sm) != 'Linux x86_64' ]]; then
    printf 'This release requires x86-64 Linux.\n' >&2
    exit 1
fi
shell_version=$(gnome-extensions version)
if [[ ! $shell_version =~ (^|[[:space:]])50([.]|$) ]]; then
    printf 'This release supports GNOME Shell 50; found %s.\n' "$shell_version" >&2
    exit 1
fi

upgrade=false
if [[ -d "$extension_dir" ]]; then
    upgrade=true
fi
install -d -- "$bin_dir"
helper_tmp=$(mktemp "$bin_dir/.codex-usage-helper.XXXXXX")
trap 'rm -f -- "$helper_tmp"' EXIT
install -m 755 -- "$bundle/codex-usage-helper" "$helper_tmp"
gnome-extensions install --force "$bundle/$uuid.shell-extension.zip"
mv -f -- "$helper_tmp" "$bin_dir/codex-usage-helper"

printf 'Installed Codex Usage for this user.\n'
if gnome-extensions enable --quiet "$uuid"; then
    if $upgrade; then
        printf 'Log out and back in to load the updated extension.\n'
    fi
else
    # A newly installed ZIP may not be known to the running shell yet. Record
    # only this UUID for the next login, leaving other extensions unchanged.
    queued=false
    if ! gnome-extensions info --quiet "$uuid" >/dev/null &&
        enabled=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null) &&
        disabled=$(gsettings get org.gnome.shell disabled-extensions 2>/dev/null) &&
        [[ $disabled != *"'$uuid'"* ]] &&
        [[ $(gsettings writable org.gnome.shell enabled-extensions) == true ]]; then
        next=$enabled
        case $enabled in
            *"'$uuid'"*) ;;
            '[]'|'@as []') next="['$uuid']" ;;
            \[*\]) next="${enabled%]}, '$uuid']" ;;
        esac
        if [[ $next == *"'$uuid'"* ]]; then
            if [[ $enabled == "$next" ]] ||
                { gsettings set org.gnome.shell enabled-extensions "$next" &&
                  [[ $(gsettings get org.gnome.shell enabled-extensions) == *"'$uuid'"* ]]; }; then
                queued=true
            fi
        fi
    fi
    if $queued; then
        printf 'Codex Usage will appear in the top bar after you log out and back in.\n'
    else
        printf 'Open the Extensions app and turn on Codex Usage. Log out and back in if it is not listed yet.\n'
    fi
fi
if [[ $(gsettings get org.gnome.shell disable-user-extensions 2>/dev/null) == true ]]; then
    printf 'User extensions are turned off in this session. Turn them on using the Extensions app.\n'
fi
