# Linux verification

The following results were recorded during the Linux implementation. They have not been rerun as part of the documentation update on 27 November 2026.

On Ubuntu 26.04.1 x86-64 with GNOME Shell 50.1 / Wayland:

- Go 1.26.8 built a statically linked x86-64 helper. Go tests (including the
  race detector), the helper fake-server integration, and GJS usage and pipe
  checks passed. These covered timeouts, malformed and oversized frames,
  account changes, URL validation, and cleanup of a hung Codex subprocess.
- The archive passed its SHA-256 check and measured about 1.2 MB, down from
  the previous 29 MB self-contained .NET archive on this machine.
- `bash Source/scripts/Test-Linux-Shell.sh` passed using a temporary home and
  a separate D-Bus and Wayland session. It verified one-command install,
  activation after restarting Shell, demo mode without live-cache writes,
  both quota windows using a fake CLI, helper restart, upgrade, and uninstall
  including removal of the activation entry and shutdown of the helper.
- The smoke test opens the quota popover and checks the layout and values of
  both linear bars in demo and fake-account modes, the unavailable state,
  and the connected Account submenu.
- The bundle also reached **Sign in required** with official Codex CLI 0.170.0
  and an empty `CODEX_HOME`; no live account was used for that check.

Still to check on a regular desktop before publishing:

- [ ] Verify the top-bar rings, popover, preferences, keyboard navigation, and
  display scaling.
- [ ] Compare a signed-in account's quotas and reset times with the official
  usage dashboard. Exercise managed sign-in, cancellation, and shared sign-out
  on a test account.
- [ ] Verify recovery after screen lock, logout/login, and suspend/resume.

See the [Linux guide](README.md), [release guide](RELEASING.md), and [verification index](../../VERIFICATION.md).
