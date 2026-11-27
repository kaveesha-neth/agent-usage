# Preparing releases

Publish binaries at [kaveesha-neth/agent-usage Releases](https://github.com/kaveesha-neth/agent-usage/releases). Keep the repository focused on source, documentation, and screenshots. Build output, restore caches, user data, and the local `Windows-x64/` installation do not belong in commits.

| Platform | Main download | Preparation and checks |
| --- | --- | --- |
| Windows x64 | `CodexUsage.exe` | [Windows release guide](Source/windows/RELEASING.md) |
| Linux x86-64 / GNOME | `codex-usage-linux-x64.tar.gz` | [Linux release guide](Source/linux/RELEASING.md) |

Windows uses a direct, self-contained executable. Linux keeps its existing archive and per-user installer. Do not rename the Linux asset or bundle directory without updating its build, installer, tests, and documentation.

## Shared release checklist

1. Follow each platform's release guide and record checks in its verification file.
2. State the source commit, release version, tested OS and architecture, Codex CLI version, prerequisites, and known limitations in release notes. Distinguish unchanged platforms from newly tested ones.
3. Upload main downloads, platform-specific checksums, and applicable license/notices files. Prefix accompanying Windows assets with `windows-x64-` and the Linux checksum with `linux-x64-` to avoid name collisions.
4. Check the README's download links after publishing. They use `/releases/latest/download/`, so the latest stable release must include both documented main assets. If one platform is unchanged, retain its tested asset with its provenance stated, or change documentation to an actual version-specific asset URL before publishing a platform-only release.
5. Confirm platform guides, screenshots, release notes, and the [verification index](VERIFICATION.md) describe shipped behavior.

The existing `v1.1.0` release contains Linux only. The Windows download address becomes available when `CodexUsage.exe` is uploaded to the latest stable release. Documentation changes do not publish assets.
