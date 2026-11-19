import {countdown, isStale, makeDemo, percent, remainingForWindow, resetLabel} from '../gnome/usage.js';

function check(condition, message) {
    if (!condition)
        throw new Error(message);
}

const now = Date.UTC(2026, 10, 20, 12);
const view = makeDemo(now);
check(remainingForWindow(view.snapshot, 300) === 52.75, 'Show the five-hour window');
check(remainingForWindow(view.snapshot, 10080) === 84, 'Show the weekly window independently');
const [first, week] = view.snapshot.buckets[0].windows;
view.snapshot.buckets[1].windows.push({...first, remainingPercent: 10}, {...week, remainingPercent: 30});
first.remainingPercent = null;
check(remainingForWindow(view.snapshot, 300) === null, 'Keep an unavailable first match');
check(remainingForWindow(view.snapshot, 10080) === 84, 'Use the first reported weekly window');
const fiveHourOnly = {buckets: [{windows: [{...first, remainingPercent: 0}]}]};
check(remainingForWindow(fiveHourOnly, 300) === 0, 'Keep zero for an exhausted five-hour window');
check(remainingForWindow(fiveHourOnly, 10080) === null, 'Keep a missing weekly window unavailable');
check(remainingForWindow(null, 300) === null, 'Handle a missing snapshot');
check(percent(null) === '—' && percent(0) === '0%', 'Distinguish missing and zero');
check(resetLabel(null) === 'Reset time unavailable', 'Handle an unknown reset time');
check(countdown(first.resetsAt, now) === 'in 2h 0m 0s', 'Show time until reset');
check(countdown(first.resetsAt, first.resetsAt * 1000) === 'Refreshing…', 'Wait for a real refresh');
const live = {...view, demo: false};
check(!isStale(live, now + 360_000) && isStale(live, now + 360_001), 'Apply six-minute freshness');
check(!isStale(view, now + 360_001), 'Keep demo data visibly synthetic instead of stale');
print('GNOME usage checks passed');
