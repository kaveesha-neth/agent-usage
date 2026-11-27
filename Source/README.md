# Source and development

Agent Usage has two native implementations using the official local Codex app-server. Windows uses WPF and a C# core; Linux uses a GNOME extension and an independent Go helper. Changes to one quota implementation do not automatically update the other.

| Location | Purpose |
| --- | --- |
| `src/CodexUsage.Widget/` | Windows widget, taskbar overlay, settings, and tray |
| `src/CodexUsage.Core/` | C# quota model, transport, cache, and polling |
| `tests/CodexUsage.Tests/` | C# assertion and fake-server integration runner |
| `windows/` | Windows usage, release, and verification guides |
| `linux/gnome/` | GNOME extension, preferences, styles, and quota presentation |
| `linux/helper/` | Independent Go quota model, transport, cache, polling, and tests |
| `linux/tests/` | GJS and Node.js integration tests |
| `linux/` | Linux installer, usage, release, verification, and implementation history |
| `scripts/` | Platform build and verification scripts |
| `schemas/` | Checked-in Codex app-server TypeScript protocol snapshot |

## Windows development

Requires Windows and the .NET 8 SDK. From the repository root:

```powershell
cd Source
dotnet build .\CodexUsage.sln -c Release
dotnet run --project .\tests\CodexUsage.Tests -c Release --no-build
dotnet run --project .\src\CodexUsage.Widget -c Release -- --mock
```

See the [Windows guide](windows/README.md#build-from-source), [release guide](windows/RELEASING.md), and [verification record](windows/VERIFICATION.md).

## Linux development

Requires the supported x86-64 Linux / GNOME environment, Go 1.26 or newer, Node.js, and GNOME tools. From the repository root:

```sh
bash Source/scripts/Build-Linux.sh
```

See the [Linux guide](linux/README.md#build-from-source), [release guide](linux/RELEASING.md), and [verification record](linux/VERIFICATION.md). Linux builds independently of WPF and .NET.

## Protocol and generated output

`schemas/` is a snapshot generated from Codex CLI 0.159.2. On Windows, from `Source`, run `.\scripts\Verify-CodexSchema.ps1` to generate schemas from the installed CLI and check required quota fields. This does not sign in or make model requests. Review changes before modifying either quota adapter; field-presence checks alone do not establish runtime compatibility.

Build output under `artifacts/`, local schemas under `schemas-local/`, restore caches, and the local `Windows-x64/` installation are ignored by Git. Distribute binaries through [GitHub Releases](https://github.com/kaveesha-neth/agent-usage/releases).
