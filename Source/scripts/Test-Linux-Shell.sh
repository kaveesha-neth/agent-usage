#!/usr/bin/env bash
set -euo pipefail
script=$(realpath -- "${BASH_SOURCE[0]}")

if [[ ${1:-} != --isolated ]]; then
    stage=$(mktemp -d "${TMPDIR:-/tmp}/codex-usage-shell.XXXXXX")
    cleanup_stage() {
        # Session D-Bus helpers may take a moment to release their FUSE mounts.
        local i
        for ((i=0; i<50; i++)); do
            if ! mountpoint -q "$stage/runtime/doc" && ! mountpoint -q "$stage/runtime/gvfs"; then
                rm -r --one-file-system -- "$stage"
                return
            fi
            sleep 0.1
        done
        printf 'Session mounts are still busy; left isolated files in %s\n' "$stage" >&2
        return 1
    }
    trap cleanup_stage EXIT
    archive=$(realpath -- "${1:-$(dirname -- "$script")/../artifacts/linux-x64/codex-usage-linux-x64.tar.gz}")
    mkdir -m 700 -- "$stage"/{home,data,config,cache,runtime}
    # Never touch the running user's GNOME settings or discover their Codex CLI.
    env -u DISPLAY -u WAYLAND_DISPLAY -u DBUS_SESSION_BUS_ADDRESS -u GSETTINGS_BACKEND \
        PATH=/usr/bin:/bin HOME="$stage/home" XDG_DATA_HOME="$stage/data" \
        XDG_CONFIG_HOME="$stage/config" XDG_CACHE_HOME="$stage/cache" \
        XDG_RUNTIME_DIR="$stage/runtime" XDG_SESSION_TYPE=wayland XDG_CURRENT_DESKTOP=GNOME \
        XDG_SESSION_DESKTOP=gnome GNOME_SHELL_SESSION_MODE=gnome LC_ALL=C.UTF-8 \
        LIBGL_ALWAYS_SOFTWARE=1 dbus-run-session -- bash "$script" --isolated "$archive" "$stage"
    exit
fi

archive=$2 stage=$3
uuid=codex-usage@agent-usage
schema=org.gnome.shell.extensions.codex-usage
installed="$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
helper="$XDG_DATA_HOME/codex-usage-widget/bin/codex-usage-helper"
cache="$XDG_CACHE_HOME/codex-usage-widget/usage-cache.json"
fake="$stage/fake-codex"
shell_pid=
cleanup() {
    local status=$?
    stop_shell
    if (( status != 0 )); then
        tail -n 60 "$stage/gnome-shell.log" >&2 || true
    fi
}
trap cleanup EXIT

stop_shell() {
    if [[ -n $shell_pid ]]; then
        kill "$shell_pid" 2>/dev/null || true
        wait "$shell_pid" 2>/dev/null || true
        shell_pid=
    fi
}

wait_for() {
    local i
    for ((i=0; i<100; i++)); do
        if "$@"; then return; fi
        sleep 0.1
    done
    printf 'Timed out: %s\n' "$*" >&2
    return 1
}

start_shell() {
    CODEX_USAGE_SMOKE_STAGE="$stage" gnome-shell --headless --wayland --no-x11 \
        --virtual-monitor=1280x720 "$@" >>"$stage/gnome-shell.log" 2>&1 &
    shell_pid=$!
    wait_for shell_ready
}

shell_ready() { gnome-extensions list >/dev/null 2>&1; }
active() { gnome-extensions info "$uuid" 2>/dev/null | grep -q 'State: ACTIVE'; }
helper_pid() { pgrep -f "^$helper --codex $fake\$"; }
helper_stopped() { ! kill -0 "$1" 2>/dev/null; }
valid_cache() {
    node -e 'const b = require(process.argv[1]).snapshot.buckets.find(b => b.id === "codex");
      if (JSON.stringify(b.windows.map(w => [w.windowDurationMins, w.remainingPercent])) !==
          "[[300,62.5],[10080,84]]") process.exit(1);' "$cache" 2>/dev/null
}

tar -xzf "$archive" -C "$stage"
bundle="$stage/codex-usage-linux-x64"
start_shell
"$bundle/install.sh"
gsettings get org.gnome.shell enabled-extensions | grep -Fq "'$uuid'"
test -x "$helper"
gsettings --schemadir "$installed/schemas" set "$schema" demo-mode true
stop_shell
start_shell --automation-script "$(dirname -- "$script")/../linux/tests/popover.js"
wait_for active
wait_for test -f "$stage/demo-popover-ok"
test ! -e "$cache"

install -m 700 -- "$(dirname -- "$script")/../linux/tests/fake-codex.mjs" "$fake.mjs"
ln -s -- "$fake.mjs" "$fake"
gsettings --schemadir "$installed/schemas" set "$schema" codex-path "$fake"
gsettings --schemadir "$installed/schemas" set "$schema" demo-mode false
wait_for valid_cache
wait_for test -f "$stage/live-popover-ok"
pid=$(helper_pid)
kill -TERM "$pid"
wait_for helper_stopped "$pid"
wait_for helper_pid >/dev/null
pid=$(helper_pid)

"$bundle/install.sh"
stop_shell
wait_for helper_stopped "$pid"
start_shell
wait_for active
wait_for helper_pid >/dev/null
pid=$(helper_pid)
"$bundle/install.sh" --uninstall
test ! -d "$installed"
test ! -e "$helper"
test -s "$cache"
if gsettings get org.gnome.shell enabled-extensions | grep -Fq "'$uuid'"; then
    printf 'Uninstall left an enabled extension entry.\n' >&2
    exit 1
fi
wait_for helper_stopped "$pid"
printf 'GNOME Shell install, popover, demo, live bridge, restart, upgrade, and uninstall passed.\n'
