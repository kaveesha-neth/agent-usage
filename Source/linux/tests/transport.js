import GLib from 'gi://GLib';
import {HelperClient, IncompatibleHelper} from '../gnome/helper.js';

const hello = `printf '%s\\n' '{"type":"hello","protocol":1}'`;
const client = new HelperClient(['/bin/sh', '-c',
    `printf '%s' '{"type":"hel'; sleep 0.02; printf '%s\\n' 'lo","protocol":1}' '{"type":"ready"}'
    while IFS= read -r command; do printf '{"type":"%s"}\\n' "$command"; done`]);
const messages = [];
const ready = Promise.withResolvers();
const reader = client.read(message => {
    if (message.type === 'ready') {
        ready.resolve();
        return;
    }
    messages.push(message.type);
    if (messages.length === 2)
        client.stop();
});
await Promise.race([reader, ready.promise]);
await Promise.all([client.send('refresh'), client.send('sign-in')]);
await reader;
if (messages.join(',') !== 'refresh,sign-in')
    throw new Error('The helper pipe lost or reordered commands');

let incompatible = false;
try {
    await new HelperClient(['/bin/sh', '-c', `printf '%s\\n' '{"type":"hello","protocol":2}'`]).read(() => {});
} catch (error) {
    incompatible = error instanceof IncompatibleHelper;
}
if (!incompatible)
    throw new Error('An incompatible helper version was not rejected');

let oversized = false;
try {
    await new HelperClient(['/bin/sh', '-c', `${hello}; exec head -c 2097153 /dev/zero`]).read(() => {});
} catch (error) {
    oversized = /oversized/.test(error.message);
}
if (!oversized)
    throw new Error('An oversized helper frame was not rejected');

const tangled = new HelperClient(['/bin/sh', '-c', `trap '' TERM; ${hello}; exec sleep 60`]);
const start = GLib.get_monotonic_time();
await tangled.stop();
if (GLib.get_monotonic_time() - start > 3_000_000)
    throw new Error('Helper shutdown waited indefinitely');
print('GNOME helper pipe checks passed');
