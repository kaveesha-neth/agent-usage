# Codex Usage for Linux

Codex Usage puts two matching quota rings and percentages in the GNOME top
bar. `5h` and `W` show the five-hour and weekly windows from the main Codex
quota bucket. An unavailable window shows a dash; another bucket's quota is
never substituted for it.
Click the indicator to see linear bars for the quota remaining in each window,
along with local reset times and live countdowns. An unavailable quota is
labeled and has no bar. Stale data is marked in the panel and details.

## Requirements

- Ubuntu 26.04 with GNOME Shell 50 on Wayland, x86-64.
- The official Codex CLI signed into a managed ChatGPT account for live quota.
  Demo mode works without the CLI. The release needs no separate language
  runtime, development tools, or admin access.

## Install

Extract `codex-usage-linux-x64.tar.gz`. From the extracted folder, as your
regular desktop user, run:

```sh
./install.sh
```

The installer enables the extension for your user. When GNOME needs to discover
or reload it, log out and back in as directed. If your session blocks user
extensions, check the Extensions app. Run the same command to upgrade.

Choose **Preferences** from the top-bar menu or run
`gnome-extensions prefs codex-usage@agent-usage`. If the CLI is undetected,
set its absolute executable path and apply it. Detection checks the graphical
session's `PATH`, `~/.local/bin`, and `~/.cargo/bin`. Enable **Demo mode** in
Preferences to try the indicator using synthetic data.

Refresh is available from the panel menu. Sign-in and cancel appear when
relevant. **Account → Sign out of shared Codex session** also affects the CLI and other
clients using that account. API-key login uses separate billing.

The helper reads usage through the local CLI. The widget keeps a sanitized
quota snapshot and account fingerprint under
`${XDG_CACHE_HOME:-$HOME/.cache}/codex-usage-widget`. Demo mode skips the live
helper and its cache. GNOME stores the demo toggle and CLI path in GSettings.

## Build and verify

On the build machine, install Go 1.26 or newer and Node.js in addition to the
GNOME command-line tools (`gnome-extensions`, `gjs`, `glib-compile-schemas`).
From the repository root:

```sh
bash Source/scripts/Build-Linux.sh
```

The script runs Linux tests, builds the precompiled Go helper,
and writes the archive and `SHA256.txt` to `Source/artifacts/linux-x64/`.
Run `sha256sum -c SHA256.txt` beside the archive to check the release download.
The fake-server tests exercise the actual quota transport without a live
account. See the repository verification record for the live-account checklist.

## Uninstall

Run from the extracted archive:

```sh
./install.sh --uninstall
```

GNOME configuration and the quota cache are retained for a future reinstall.
