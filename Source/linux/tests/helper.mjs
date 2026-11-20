import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chmod, copyFile, mkdtemp, readFile, rm} from 'node:fs/promises';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createInterface} from 'node:readline';

const helper = resolve(process.argv[2]);
const temp = await mkdtemp(join(tmpdir(), 'codex-usage-helper-test-'));
const fake = join(temp, 'fake codex.mjs');
const cache = join(temp, 'codex-usage-widget', 'usage-cache.json');
try {
    await copyFile(new URL('./fake-codex.mjs', import.meta.url), fake);
    await chmod(fake, 0o700);
    await run(fake, 'https://auth.openai.com/authorize', async (child, next) => {
        const connected = message => message.type === 'view' && message.view.connection === 'Connected';
        const remaining = message => message.view.snapshot.buckets[0].windows[0].remainingPercent;
        assert.equal(remaining(await next(connected)), 62.5);
        child.stdin.write('refresh\n');
        assert.equal(remaining(await next(connected)), 61.5);
        const data = await readFile(cache, 'utf8');
        assert.match(JSON.parse(data).AccountKey, /^[0-9A-F]{64}$/);
        assert.ok(!data.includes('synthetic@example.invalid'));

        child.stdin.write('sign-in\n');
        assert.equal((await next(message => message.type === 'auth-url')).url,
            'https://auth.openai.com/authorize');
        await next(done('sign-in'));
        child.stdin.write('cancel-sign-in\n');
        await next(done('cancel-sign-in'));
        child.stdin.write('sign-out\n');
        await next(done('sign-out'));
        await assert.rejects(readFile(cache), {code: 'ENOENT'});
    });
    await run(fake, 'https://openai.com.example.invalid/', async (child, next) => {
        await next(message => message.view?.connection === 'Connected');
        child.stdin.write('sign-in\n');
        const auth = await next(message => ['auth-url', 'error'].includes(message.type));
        assert.equal(auth.type, 'error');
        assert.match(auth.message, /unexpected authentication URL/);
    });
    await run(join(temp, 'missing'), '', async (_child, next) => {
        const message = await next(value => value.view?.connection === 'Disconnected');
        assert.equal(message.view.snapshot, null);
    });
    console.log('Linux helper checks passed');
} finally {
    await rm(temp, {recursive: true});
}

function done(command) {
    return message => message.type === 'action-done' && message.command === command;
}

async function run(executable, authUrl, verify) {
    const child = spawn(helper, ['--codex', executable], {
        env: {...process.env, XDG_CACHE_HOME: temp, FAKE_AUTH_URL: authUrl},
        stdio: ['pipe', 'pipe', 'inherit'],
    });
    const exited = once(child, 'exit');
    const lines = createInterface({input: child.stdout})[Symbol.asyncIterator]();
    const deadline = setTimeout(() => child.kill(), 10_000);
    try {
        await verify(child, async predicate => {
            while (true) {
                const {value, done: ended} = await lines.next();
                assert.ok(!ended, 'Helper closed before the expected message');
                const message = JSON.parse(value);
                if (predicate(message))
                    return message;
            }
        });
        child.stdin.end();
        assert.deepEqual(await exited, [0, null], 'Helper shuts down cleanly on EOF');
    } finally {
        clearTimeout(deadline);
        child.kill();
        await exited;
    }
}
