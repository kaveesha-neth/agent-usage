# Codex Usage for Windows

The Windows application provides a desktop quota widget and an optional taskbar overlay. See [Windows setup](https://github.com/kaveesha-neth/agent-usage#windows-setup) for first-time setup.

## Requirements and download

- Windows 10 or 11 on x64. An ARM64 build target exists in source and needs separate validation before distribution.
- The official [Codex CLI](https://developers.openai.com/codex/cli), signed into a ChatGPT account, for live quota. API-key billing does not expose subscription quota.
- The self-contained [CodexUsage.exe](https://github.com/kaveesha-neth/agent-usage/releases/latest/download/CodexUsage.exe) needs no separate .NET installation. This asset address becomes available when the Windows executable is published; `v1.1.0` contains Linux only.

Save the executable in a permanent folder and run it. There is no installer. The executable is unsigned. Only one widget instance runs per Windows session.

## Desktop and taskbar controls

Drag the desktop widget to position it. Right-click it or open its tray icon for Settings, refresh, position locking, click-through, startup registration, and Quit. Disable click-through through the tray menu if the widget cannot be selected.

The desktop shows every reported quota bucket and window, including remaining quota, local reset times, countdowns, and connection freshness. Unreported fields remain unavailable. Remaining quota is `max(0, 100 - usedPercent)`; bar rendering is clamped to 0–100. The widget does not invent daily, weekly, monthly, or message counts.

Enable **Taskbar widget** in Settings to display a ring and percentage while keeping the desktop widget visible. The ring currently uses the first reported 300-minute window across all buckets. Without one, it shows an empty ring and an unavailable mark. Hover over the ring, number, or gap for details covering all returned windows. Right-click the taskbar overlay to open Settings.

**Taskbar offset** moves the overlay left of the notification area. **Taskbar zoom** scales it from 50% to 200%. These settings save immediately. The overlay does not reserve space, so taskbar icons can overlap it. Placement supports the primary horizontal taskbar; vertical and automatically hidden taskbars are outside this mode.

Explorer desktop attachment uses undocumented Windows behavior and can vary with Explorer versions, wallpaper tools, and virtual desktops. In Settings, **Use fallback bottom window** selects a non-topmost alternative after saving and relaunching. Show Desktop can hide the fallback. Open Settings from the tray and choose **Recover widget: disable click-through, unlock, move upper-right** to restore selection and placement.

## Account and CLI settings

The widget reuses the CLI's existing managed sign-in. Choose **Sign in with ChatGPT** in the tray menu when needed. Settings also provides cancellation and sign-out. Signing out affects the shared CLI session and other clients using it.

CLI detection checks `PATH` for `codex.exe` and native executables under the default npm installation. For a custom installation, browse to the native `codex.exe` in Settings, save, quit, and relaunch. The widget does not execute `codex.cmd` or shell scripts. Saving the CLI path or fallback setting does not automatically restart the application.

## Demo mode

Quit the live widget, then run from the executable's folder:

```powershell
.\CodexUsage.exe --mock
```

Demo mode is permanently marked **DEMO**, uses synthetic data, and does not start the app-server or read or write the live usage cache. Quit it before relaunching in live mode.

## Upgrade and uninstall

To upgrade, choose **Quit** from the tray, replace `CodexUsage.exe` with the new release executable, and relaunch. Settings and quota cache remain in `%LOCALAPPDATA%\CodexUsageWidget`.

If you move the executable after enabling **Start with Windows**, disable and re-enable that option from the new location to update the startup entry.

To uninstall, disable **Start with Windows**, quit, and delete the executable and accompanying release files. Optionally delete `%LOCALAPPDATA%\CodexUsageWidget` to remove settings and quota cache. This does not uninstall the Codex CLI or sign it out.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| CLI not found | Select the native `codex.exe` in Settings, save, quit, and relaunch. |
| Sign in required or API key only | Use **Sign in with ChatGPT** for subscription quota. |
| Widget cannot be selected or found | Open Settings from the tray and use **Recover widget**; try fallback mode if Explorer attachment is unreliable. |
| Taskbar overlaps icons | Adjust offset and zoom. The overlay cannot reserve taskbar space. |
| Quota stale or unavailable | Check the detected CLI in Settings, refresh, and compare with the [official usage dashboard](https://chatgpt.com/codex/settings/usage). Missing values are not zero. |
| Second instance cannot launch | Quit the existing tray instance before switching modes or replacing the executable. |

## Build from source

Install the .NET 8 SDK on Windows. From the repository root:

```powershell
cd Source
dotnet build .\CodexUsage.sln -c Release
dotnet run --project .\tests\CodexUsage.Tests -c Release --no-build
dotnet run --project .\src\CodexUsage.Widget -c Release
```

Append `-- --mock` to the last command for demo mode. Tests are a standalone assertion runner; use the command above rather than `dotnet test`.

From `Source`, publish with `.\scripts\Build.ps1`. Output is `Source/artifacts/win-x64/CodexUsage.exe`. Use `.\scripts\Build.ps1 -Runtime win-arm64` for ARM64; building does not establish that it has been tested on that target.

See the [release guide](RELEASING.md), [verification record](VERIFICATION.md), [source layout](../README.md), and [screenshot guide](../../docs/images/README.md).
