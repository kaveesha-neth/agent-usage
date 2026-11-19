# Linux implementation plan

The first release targets Ubuntu 26.04 / GNOME Shell 50 on Wayland, x86-64.
The top bar is the Linux equivalent of the Windows taskbar indicator. Keep the
quota and account behavior in `CodexUsage.Core` and use a thin GNOME frontend.

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
- [ ] Package the extension and self-contained helper for per-user install.
  Document requirements, install/uninstall, demo mode, and release checks.
- [ ] Verify the build and demo on GNOME 50 / Wayland, including enable/disable,
  keyboard controls, and process cleanup. Record what was exercised.
- [ ] Before publishing, compare live buckets, displayed values, and reset times
  with the official usage dashboard. Verify managed login, cancellation and
  shared sign-out with a test account, plus suspend/resume on a real session.

Each implementation milestone gets its own Git commit after its checks. The
Windows build and assertion runner remain the regression baseline. Use Linux
project-level build commands so the helper can be built independently of WPF.

KDE Plasma, other trays, dock placement, and a separate desktop card are
follow-up integrations. They can share the same quota model and Linux helper.
