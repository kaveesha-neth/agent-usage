# Verification record

Updated 25 October 2026 on Windows x64.

## Completed checks

| Check | Result |
| --- | --- |
| Release solution build | Succeeded with zero warnings and errors |
| Assertion and integration runner | 34 checks passed |
| Windows x64 self-contained publish | Succeeded; single-file `CodexUsage.exe` produced |
| Local executable replacement | SHA-256 matched the staged build; the replacement process started and remained running |

The automated runner covers quota parsing, null and changed fields, reset timestamps and time zones, stale data, reconnects, app-server JSONL exchange, and blocked methods. It uses synthetic fixtures and a fake subprocess server. These checks do not establish that the live account display matches the official dashboard.

## Manual Windows checks still needed

- [ ] Compare a signed-in account's buckets, percentages, and reset times with the official usage dashboard.
- [ ] Check managed sign-in, cancellation, sign-out, and API-key-only behavior.
- [ ] Confirm the desktop view appears behind ordinary windows and survives Explorer restart, display changes, and sleep/resume.
- [ ] Confirm the fallback, Recover widget, click-through, and Start with Windows controls.
- [ ] Enable the taskbar view and verify both views stay visible together.
- [ ] Hover over the ring, percentage, and gap; confirm the popover appears above a bottom taskbar and its countdown updates.
- [ ] Try taskbar zoom at 50%, 100%, and 200%, adjust the offset, change display scaling, and restart Explorer; confirm the overlay returns and remains visible.
- [ ] Run `--mock` separately and confirm permanent DEMO markings and no live app-server or cache use.

Explorer desktop attachment and taskbar overlay placement depend on Windows shell behavior. Vertical and automatically hidden taskbars are outside the supported taskbar placement mode. The executable is unsigned, and the Codex CLI is a separate prerequisite.

## Linux verification

On Ubuntu 26.04.1 x86-64 with GNOME Shell 50.1 / Wayland:

- The .NET 8 Release helper build succeeded with no warnings or errors. The
  existing 34 Core checks, Linux helper fake-server checks, and GJS usage and
  pipe checks passed.
- An isolated headless Shell enabled the extension in demo mode without writing
  a live cache, switched to a fake Codex CLI and wrote a quota cache, then
  disabled the extension and shut down the helper and its subprocess.
- The self-contained Linux x86-64 archive passed its checksum and fake-server
  checks. A fresh install from the archive passed demo isolation, recovered
  after stopping the helper, and uninstalled in the isolated Wayland session.

Still to check on a regular desktop before publishing:

- [ ] Verify the top-bar ring, popover, preferences, keyboard navigation, and
  display scaling.
- [ ] Compare a signed-in account's quotas and reset times with the official
  usage dashboard. Exercise managed sign-in, cancellation, and shared sign-out
  on a test account.
- [ ] Verify recovery after screen lock, logout/login, and suspend/resume.
