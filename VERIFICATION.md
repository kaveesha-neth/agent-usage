# Verification records

Verification is tracked separately for each platform so historical results are distinguishable from current checks.

| Platform | Recorded automated checks | Still requires manual validation |
| --- | --- | --- |
| [Windows](Source/windows/VERIFICATION.md) | Release build and all 34 checks passed on 27 November 2026. Self-contained publish and executable replacement were recorded on 25 October 2026. | Live quota and account actions, Explorer attachment, taskbar interaction, startup, recovery, and demo isolation. |
| [Linux / GNOME](Source/linux/VERIFICATION.md) | Previously recorded Go, GJS, fake-server, archive, and isolated GNOME session checks on Ubuntu 26.04.1 / GNOME 50.1. | Regular-desktop appearance, accessibility, scaling, live quota and account actions, and session recovery. |

The Linux checks were not rerun during the documentation update on 27 November 2026. Automated fake-server checks do not establish that live quotas match the official dashboard.

Use the [Windows checklist](Source/windows/VERIFICATION.md) and [Linux checklist](Source/linux/VERIFICATION.md) before releasing their respective builds. Record the environment, CLI version, source commit, date, and actual results when completing checks.

See [release preparation](RELEASING.md) and [source development](Source/README.md).
