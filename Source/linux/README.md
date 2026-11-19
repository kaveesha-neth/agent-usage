# Codex Usage for Linux

Codex Usage puts two matching quota rings and percentages in the GNOME top
bar. `5h` shows the first reported five-hour window and `W` shows the first
reported weekly window. An unavailable window shows a dash in its own slot.
Click the indicator to see all reported quota windows, local reset times,
countdowns, and connection status. Stale data is marked in the panel and details.

## Requirements

- Ubuntu 26.04 with GNOME Shell 50 on Wayland, x86-64.
- The official Codex CLI signed into a managed ChatGPT account for live quota.
  Demo mode works without the CLI. The release bundles the .NET runtime.

## Install

Extract `codex-usage-linux-x64.tar.gz`. From the extracted folder, as your
regular desktop user, run:

```sh
bash install.sh
gnome-extensions enable codex-usage@agent-usage
```

If GNOME hasn't discovered the new extension, log out and back in before
enabling it. After an upgrade, log out and back in to load the new extension
code. The enabled extension starts with the GNOME session.

Choose **Preferences** from the top-bar menu or run
`gnome-extensions prefs codex-usage@agent-usage`. If the CLI is undetected,
set its absolute executable path and apply it. Detection checks the graphical
session's `PATH`, `~/.local/bin`, and `~/.cargo/bin`. Enable **Demo mode** in
Preferences to try the indicator using synthetic data.

Refresh, browser sign-in, cancel, and sign-out are available from the panel
menu. **Sign out of shared Codex session** also affects the CLI and other
clients using that account. API-key login uses separate billing.

The helper reads usage through the local CLI. The widget keeps a sanitized
quota snapshot and account fingerprint under
`${XDG_CACHE_HOME:-$HOME/.cache}/codex-usage-widget`. Demo mode skips the live
helper and its cache. GNOME stores the demo toggle and CLI path in GSettings.

## Build and verify

On the target desktop, install the .NET 8 SDK and Node.js in addition to the
GNOME command-line tools (`gnome-extensions`, `gjs`, `glib-compile-schemas`).
From the repository root:

```sh
bash Source/scripts/Build-Linux.sh
```

The script runs Core and Linux tests, publishes the self-contained helper,
and writes the archive and `SHA256.txt` to `Source/artifacts/linux-x64/`.
Run `sha256sum -c SHA256.txt` beside the archive to check the release download.
The fake-server tests exercise the actual quota transport without a live
account. See the repository verification record for the live-account checklist.

## Uninstall

Disable and uninstall the extension, then remove its helper:

```sh
gnome-extensions disable codex-usage@agent-usage
gnome-extensions uninstall codex-usage@agent-usage
rm -- "${XDG_DATA_HOME:-$HOME/.local/share}/codex-usage-widget/bin/codex-usage-helper"
```

GNOME configuration and the quota cache are retained for a future reinstall.
