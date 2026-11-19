import {HelperClient} from '../gnome/helper.js';

const client = new HelperClient(['/bin/sh', '-c',
    'while IFS= read -r command; do printf \'{"type":"%s"}\\n\' "$command"; done']);
const messages = [];
const reader = client.read(message => {
    messages.push(message.type);
    if (messages.length === 2)
        client.stop();
});
await Promise.all([client.send('refresh'), client.send('sign-in')]);
await reader;
if (messages.join(',') !== 'refresh,sign-in')
    throw new Error('The helper pipe lost or reordered commands');
print('GNOME helper pipe checks passed');
