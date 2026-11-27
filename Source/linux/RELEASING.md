# Linux release preparation

Keep the existing `codex-usage-linux-x64.tar.gz` archive and `codex-usage-linux-x64` extracted directory. The archive includes the GNOME extension ZIP, prebuilt Go helper, `install.sh`, Linux README, license, and Go notices.

## Build and verify

On the supported Ubuntu / GNOME x86-64 build machine, with Go 1.26 or newer, Node.js, and GNOME tools installed, run from the repository root:

```sh
bash Source/scripts/Build-Linux.sh
(cd Source/artifacts/linux-x64 && sha256sum -c SHA256.txt)
bash Source/scripts/Test-Linux-Shell.sh
```

The build runs automated checks and writes the archive and checksum to `Source/artifacts/linux-x64/`. The shell test uses an isolated GNOME session. It does not replace regular-desktop and live-account checks in the [Linux verification record](VERIFICATION.md).

## Prepare assets

Give the checksum a unique release asset name without changing the build script. From the repository root:

```sh
cp Source/artifacts/linux-x64/SHA256.txt Source/artifacts/linux-x64/linux-x64-SHA256.txt
```

Upload `codex-usage-linux-x64.tar.gz` and `linux-x64-SHA256.txt` to the [GitHub release](https://github.com/kaveesha-neth/agent-usage/releases). Keep generated Go notices inside the archive. Users downloading both files can run `sha256sum -c linux-x64-SHA256.txt` beside the archive.

The main download address is https://github.com/kaveesha-neth/agent-usage/releases/latest/download/codex-usage-linux-x64.tar.gz. Release notes should identify Ubuntu 26.04, GNOME Shell 50 / Wayland, x86-64, version and source commit, tested CLI, and the [Linux guide](https://github.com/kaveesha-neth/agent-usage/blob/main/Source/linux/README.md).

Follow the [shared release checklist](../../RELEASING.md) before marking a release latest.
