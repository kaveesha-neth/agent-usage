import {countdown, fiveHourRemaining, isStale, makeDemo, percent, resetLabel} from '../gnome/usage.js';

function check(condition, message) {
    if (!condition)
        throw new Error(message);
}

const now = Date.UTC(2026, 10, 20, 12);
const view = makeDemo(now);
check(fiveHourRemaining(view.snapshot) === 52.75, 'Show the first five-hour window');
const first = view.snapshot.buckets[0].windows[0];
view.snapshot.buckets[1].windows.push({...first, remainingPercent: 10});
first.remainingPercent = null;
check(fiveHourRemaining(view.snapshot) === null, 'Keep an unavailable first match');
check(fiveHourRemaining({buckets: []}) === null, 'Handle a missing five-hour window');
check(percent(null) === '—' && percent(0) === '0%', 'Distinguish missing and zero');
check(resetLabel(null) === 'Reset time unavailable', 'Handle an unknown reset time');
check(countdown(first.resetsAt, now) === 'in 2h 0m 0s', 'Show time until reset');
check(countdown(first.resetsAt, first.resetsAt * 1000) === 'Refreshing…', 'Wait for a real refresh');
const live = {...view, demo: false};
check(!isStale(live, now + 360_000) && isStale(live, now + 360_001), 'Apply six-minute freshness');
check(!isStale(view, now + 360_001), 'Keep demo data visibly synthetic instead of stale');
print('GNOME usage checks passed');
