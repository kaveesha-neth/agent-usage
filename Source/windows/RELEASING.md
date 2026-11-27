# Windows release preparation

Publish a direct `CodexUsage.exe` download. The application is self-contained and needs no installer or separate .NET runtime.

## Build and verify

On Windows with the .NET 8 SDK, from the repository root:

```powershell
.\Source\scripts\Build.ps1
```

The script builds the solution, runs the standalone checks, and publishes `Source/artifacts/win-x64/CodexUsage.exe`. It does not create checksums or upload files. Build from fresh output rather than the ignored `Windows-x64/` installation, which can contain old executables.

Run the executable from a separate folder and complete the [Windows verification checklist](VERIFICATION.md). Test live and demo modes separately. Use `-Runtime win-arm64` only for a separately validated ARM64 release; do not label an ARM64 executable as the x64 asset.

## Prepare assets

Generate a checksum from the exact executable to upload. From the repository root:

```powershell
$releaseExe = Get-Item -LiteralPath .\Source\artifacts\win-x64\CodexUsage.exe
$releaseHash = Get-FileHash -LiteralPath $releaseExe.FullName -Algorithm SHA256
"$($releaseHash.Hash.ToLowerInvariant())  CodexUsage.exe" | Set-Content -LiteralPath .\Source\artifacts\win-x64\windows-x64-SHA256.txt -Encoding ascii
```

Upload these assets to the [GitHub release](https://github.com/kaveesha-neth/agent-usage/releases):

| Asset name | Source |
| --- | --- |
| `CodexUsage.exe` | `Source/artifacts/win-x64/CodexUsage.exe` |
| `windows-x64-SHA256.txt` | Generated checksum beside the executable |
| `windows-x64-LICENSE.txt` | Root `LICENSE`, copied under this asset name |
| `windows-x64-DOTNET-LICENSE.txt` | `Notices/DOTNET-LICENSE.txt` |
| `windows-x64-DOTNET-THIRD-PARTY-NOTICES.txt` | `Notices/DOTNET-THIRD-PARTY-NOTICES.txt` |
| `windows-x64-WINDOWSDESKTOP-LICENSE.txt` | `Notices/WINDOWSDESKTOP-LICENSE.txt` |

Keep license and notices available alongside the executable. Do not upload `CodexUsage.previous.exe`, preferences, caches, symbols, or local installation data. No ZIP is required by the Windows setup.

The main download address is https://github.com/kaveesha-neth/agent-usage/releases/latest/download/CodexUsage.exe. Release notes should identify Windows x64, version and source commit, tested CLI, unsigned executable status, taskbar limitations, and the [Windows guide](https://github.com/kaveesha-neth/agent-usage/blob/main/Source/windows/README.md).

Follow the [shared release checklist](../../RELEASING.md) before marking a release latest.
