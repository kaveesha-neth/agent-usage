export function remainingForWindow(snapshot, durationMins) {
    for (const bucket of snapshot?.buckets ?? []) {
        const window = bucket.windows.find(item => item.windowDurationMins === durationMins);
        if (window)
            return window.remainingPercent ?? null;
    }
    return null;
}

export function isStale(view, now) {
    return !view.demo && view.snapshot !== null &&
        (view.stale || now - Date.parse(view.snapshot.fetchedAt) > 6 * 60 * 1000);
}

const percentFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits: 3});
const resetFormat = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric',
    minute: '2-digit', second: '2-digit', timeZoneName: 'short',
});

export function percent(value) {
    return value === null ? '—' : `${percentFormat.format(value)}%`;
}

export function resetLabel(resetsAt) {
    return resetsAt === null ? 'Reset time unavailable' :
        `Resets ${resetFormat.format(resetsAt * 1000)}`;
}

export function countdown(resetsAt, now) {
    if (resetsAt === null)
        return 'Countdown unavailable';
    const seconds = Math.ceil((resetsAt * 1000 - now) / 1000);
    if (seconds <= 0)
        return 'Refreshing…';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds / 3600) % 24;
    const minutes = Math.floor(seconds / 60) % 60;
    if (days)
        return `in ${days}d ${hours}h ${minutes}m`;
    if (hours)
        return `in ${hours}h ${minutes}m ${seconds % 60}s`;
    return `in ${minutes}m ${seconds % 60}s`;
}

export function makeDemo(now = Date.now()) {
    const seconds = Math.floor(now / 1000);
    return {
        demo: true, connection: 'DEMO', stale: false, detail: 'Synthetic data',
        snapshot: {
            fetchedAt: new Date(now).toISOString(),
            buckets: [
                {name: 'Demo General', windows: [
                    {durationLabel: '5-hour window', windowDurationMins: 300,
                        remainingPercent: 52.75, resetsAt: seconds + 7200},
                    {durationLabel: '1 week window', windowDurationMins: 10080,
                        remainingPercent: 84, resetsAt: seconds + 259200},
                ]},
                {name: 'Demo Additional', windows: [
                    {durationLabel: 'Primary window', windowDurationMins: null,
                        remainingPercent: null, resetsAt: null},
                ]},
            ],
        },
    };
}
