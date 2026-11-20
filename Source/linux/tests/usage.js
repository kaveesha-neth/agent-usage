import {accountAction, countdown, isStale, makeDemo, percent, quotaLevel, quotaSections,
    remainingForWindow, resetLabel} from '../gnome/usage.js';

function check(condition, message) {
    if (!condition)
        throw new Error(message);
}

const now = Date.UTC(2026, 10, 20, 12);
const view = makeDemo(now);
const [main, other] = quotaSections({buckets: [...view.snapshot.buckets].reverse()});
check(main.rows.map(row => row.title).join(',') === '5-hour limit,Weekly limit', 'Show primary limits first');
check(other.rows[0].remainingPercent === null, 'Retain additional quota buckets');
check(quotaLevel(null) === 'unknown' && quotaLevel(0) === 'critical' && quotaLevel(10) === 'critical' &&
    quotaLevel(11) === 'low' && quotaLevel(25) === 'low' && quotaLevel(26) === 'normal', 'Classify bar levels');
check(accountAction(view) === null && accountAction({connection: 'Connecting'}) === null &&
    accountAction({connection: 'Sign in required'}) === 'sign-in' &&
    accountAction({connection: 'API key only'}) === 'sign-in' &&
    accountAction({connection: 'Signing in'}) === 'cancel' &&
    accountAction({connection: 'Connected'}) === 'manage', 'Only show relevant account actions');
check(remainingForWindow(view.snapshot, 300) === 52.75, 'Show the five-hour window');
check(remainingForWindow(view.snapshot, 10080) === 84, 'Show the weekly window independently');
const [first, week] = view.snapshot.buckets[0].windows;
view.snapshot.buckets[1].windows.push({...first, remainingPercent: 10}, {...week, remainingPercent: 30});
first.remainingPercent = null;
check(remainingForWindow(view.snapshot, 300) === null, 'Keep an unavailable first match');
check(remainingForWindow(view.snapshot, 10080) === 84, 'Use the main bucket for weekly quota');
view.snapshot.buckets.reverse();
check(remainingForWindow(view.snapshot, 300) === null, 'Find the main bucket regardless of order');
view.snapshot.buckets[1].windows.pop();
check(remainingForWindow(view.snapshot, 10080) === null, 'Never borrow weekly quota from a different bucket');
view.snapshot.buckets.reverse();
const fiveHourOnly = {buckets: [{windows: [{...first, remainingPercent: 0}]}]};
check(remainingForWindow(fiveHourOnly, 300) === 0, 'Keep zero for an exhausted five-hour window');
check(remainingForWindow(fiveHourOnly, 10080) === null, 'Keep a missing weekly window unavailable');
check(quotaSections(fiveHourOnly)[0].rows.map(row => row.remainingPercent).join(',') === '0,',
    'Show a zero balance without fabricating the missing window');
check(remainingForWindow(null, 300) === null, 'Handle a missing snapshot');
check(percent(null) === '—' && percent(0) === '0%', 'Distinguish missing and zero');
check(resetLabel(null) === 'Reset time unavailable', 'Handle an unknown reset time');
check(countdown(first.resetsAt, now) === 'in 2h 0m 0s', 'Show time until reset');
check(countdown(first.resetsAt, first.resetsAt * 1000) === 'Refreshing…', 'Wait for a real refresh');
const live = {...view, demo: false};
check(!isStale(live, now + 360_000) && isStale(live, now + 360_001), 'Apply six-minute freshness');
check(!isStale(view, now + 360_001), 'Keep demo data visibly synthetic instead of stale');
print('GNOME usage checks passed');
