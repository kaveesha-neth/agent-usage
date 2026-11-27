# Linux implementation history

This historical checklist records the Linux migration, including the earlier C# helper that was later replaced by Go. For current architecture and setup, use the [Linux guide](README.md); for outstanding release checks, use the [verification record](VERIFICATION.md).

The first release targets Ubuntu 26.04 / GNOME Shell 50 on Wayland, x86-64.
The top bar is the Linux equivalent of the Windows taskbar indicator. Keep a
thin GNOME frontend and use the official local Codex app-server on both
platforms. Linux uses a prebuilt Go helper; Windows and its C# core are out of
scope for this migration.

## Task list

- [x] Record the scope, workflow, and acceptance checks in this plan.
- [x] Build a GNOME panel indicator with synthetic data. Show the first
  300-minute window as a ring and percentage, and provide a keyboard-accessible
  details menu with all buckets, reset times, countdowns, and connection status.
- [x] Add a Linux helper that references `CodexUsage.Core`. Resolve the Codex CLI
  from the configured path, session PATH, or known user install locations. Use
  the user's XDG cache directory and a private JSON-lines connection to GNOME.
  Test the helper with a fake Codex subprocess.
- [x] Wire the panel to the helper. Add refresh, validated browser sign-in,
  cancel, sign-out, usage dashboard, and preferences. Ensure demo mode never
  starts the helper or touches the live cache. Exercise stop/restart, dropped
  connections, stale data, and missing CLI states.
- [x] Package the extension and self-contained helper for per-user install.
  Document requirements, install/uninstall, demo mode, and release checks.
- [x] Verify the release archive in an isolated GNOME 50 / Wayland session.
  Exercise install, enable/disable, demo isolation, helper restart, and uninstall.
- [x] Show matching five-hour (`5h`) and weekly (`W`) meters in the GNOME panel.
- [x] Implement and test the Linux Go helper against the fake Codex
  contract, including cancellation, malformed input, and account changes.
- [x] Version the helper connection, bound shutdown, and show `5h` and `W` from
  the same primary quota bucket. Keep all buckets in the details menu.
- [x] Switch release packaging to Go, remove the Linux-only C# helper, and make
  one per-user install command sufficient when the session supports it. No SDK,
  development runtime, or `sudo` should be required on the target desktop.
- [x] Test the new archive and install, upgrade, and uninstall in an isolated
  GNOME session; record what still requires a visible desktop or live account.
- [x] Redesign the GNOME popover with linear quota bars, reset times and
  countdowns grouped by window, and account actions shown only when relevant.
- [ ] Check the panel, keyboard navigation, and scaling on a regular desktop.
- [ ] Before publishing, compare live buckets, displayed values, and reset times
  with the official usage dashboard. Verify managed login, cancellation and
  shared sign-out with a test account, plus suspend/resume on a real session.

Each implementation milestone gets its own Git commit after its checks. The
Linux helper and release build must work independently of WPF and .NET.

KDE Plasma, other trays, dock placement, and a separate desktop card are
follow-up integrations. They can share the same quota model and Linux helper.
