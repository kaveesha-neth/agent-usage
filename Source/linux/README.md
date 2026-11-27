# Codex Usage for Linux

The Linux application is a GNOME Shell extension with a prebuilt Go helper. See [Linux setup](https://github.com/kaveesha-neth/agent-usage#linux-setup) for first-time setup.

## Requirements and download

- Ubuntu 26.04 with GNOME Shell 50 on Wayland, x86-64.
- The official [Codex CLI](https://developers.openai.com/codex/cli), signed into a ChatGPT account, for live quota. API-key billing does not expose subscription quota.
- Download [codex-usage-linux-x64.tar.gz](https://github.com/kaveesha-neth/agent-usage/releases/latest/download/codex-usage-linux-x64.tar.gz). The release needs no separate language runtime, development tools, or admin access.

From the download folder, as your regular desktop user:

```sh
tar -xzf codex-usage-linux-x64.tar.gz
cd codex-usage-linux-x64
./install.sh
```

Do not use `sudo`. Log out and back in when prompted, including after an upgrade. If the indicator is missing, open GNOME **Extensions** and enable **Codex Usage**.

## Top-bar and popover controls

The top bar shows matching `5h` and `W` quota rings and percentages for the five-hour and weekly windows. It prefers the `codex` bucket, then the legacy `unidentified` bucket, then a sole bucket if only one exists. It does not substitute a window from an unrelated bucket for a missing main window.

Click the indicator for quota bars, local reset times, live countdowns, and all reported buckets. An unavailable quota shows a dash and has no bar. Stale data is marked in the panel and details. Quotas come from reported percentages; the extension does not estimate message counts.

Refresh is available from the panel menu. Account sign-in and cancellation appear when relevant. **Account → Sign out of shared Codex session** affects the CLI and other clients using that account.

## Account and CLI settings

Choose **Preferences** from the indicator or run:

```sh
gnome-extensions prefs codex-usage@agent-usage
```

If the CLI is undetected, set its absolute executable path and apply it. Detection checks the graphical session's `PATH`, `~/.local/bin`, and `~/.cargo/bin`. A CLI available in an interactive terminal may still need an explicit path in the graphical session.

## Demo mode

Enable **Demo mode** in Preferences to use synthetic data without installing or signing into Codex. Demo mode skips the live helper and its quota cache. Disable it to return to live data.

## Upgrade and uninstall

To upgrade, extract the newer archive and run `./install.sh` again as your regular desktop user. Log out and back in to load the updated extension when prompted.

From the extracted archive, uninstall with:

```sh
./install.sh --uninstall
```

Re-extract the archive first if you no longer have the installer. Uninstall removes the extension and helper while retaining GNOME preferences and quota cache. It does not uninstall the Codex CLI or sign it out.

GNOME stores the demo toggle and CLI path in GSettings. The cache is under `$XDG_CACHE_HOME/codex-usage-widget`, defaulting to `~/.cache/codex-usage-widget` when the variable is unset or non-absolute. The helper is under `$XDG_DATA_HOME/codex-usage-widget/bin/`, defaulting to `~/.local/share/codex-usage-widget/bin/` when the variable is unset or non-absolute.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Extension missing after install or upgrade | Log out and back in, then check GNOME Extensions and whether user extensions are enabled. |
| Unsupported desktop or architecture | This release targets GNOME Shell 50 on x86-64 Linux. KDE Plasma and other desktops are not supported. |
| CLI not found | Set its absolute path in Preferences; the graphical session may have a different `PATH` from your terminal. |
| Sign in required or API key only | Use the indicator's ChatGPT sign-in action for subscription quota. |
| Quota stale or unavailable | Refresh, check CLI sign-in, and compare with the [official usage dashboard](https://chatgpt.com/codex/settings/usage). Missing windows remain unavailable. |

## Build from source

On the supported x86-64 Linux build machine, install Go 1.26 or newer, Node.js, and GNOME tools (`gnome-extensions`, `gjs`, `glib-compile-schemas`). From the repository root:

```sh
bash Source/scripts/Build-Linux.sh
```

The script runs Go, GJS, schema, and fake-server integration checks, builds the Go helper, and writes `codex-usage-linux-x64.tar.gz` and `SHA256.txt` to `Source/artifacts/linux-x64/`. From that output directory, run `sha256sum -c SHA256.txt` to verify the archive. Linux builds independently of .NET and the Windows projects.

See the [release guide](https://github.com/kaveesha-neth/agent-usage/blob/main/Source/linux/RELEASING.md), [verification record](https://github.com/kaveesha-neth/agent-usage/blob/main/Source/linux/VERIFICATION.md), and [source layout](https://github.com/kaveesha-neth/agent-usage/blob/main/Source/README.md). These links also work from the README included in the release archive.
