#!/usr/bin/env node
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';

if (process.argv.slice(2).join(' ') !== 'app-server')
    throw new Error('Unexpected executable arguments');
const mode = process.env.FAKE_MODE;
const send = value => console.log(JSON.stringify(value));
const now = Math.floor(Date.now() / 1000);
let initialized = false;
let account = {type: 'chatgpt', planType: 'plus', email: 'synthetic@example.invalid'};
let reads = 0;
for await (const line of createInterface({input: process.stdin})) {
    const {id, method, params, error} = JSON.parse(line);
    if (id === 'server-1' && error?.code === -32601)
        continue;
    if (method === 'initialized') {
        initialized = true;
        continue;
    }
    if (method !== 'initialize' && !initialized)
        throw new Error('Request before app-server initialization');
    let result = {};
    switch (method) {
    case 'initialize':
        if (mode === 'hang') {
            writeFileSync('fake-pid', String(process.pid));
            await new Promise(() => setInterval(() => {}, 1000));
        }
        if (mode === 'server-request')
            send({id: 'server-1', method: 'account/chatgptAuthTokens/refresh', params: {}});
        break;
    case 'account/read':
        if (mode === 'switch' && reads === 1)
            account = {type: 'chatgpt', planType: 'pro', email: 'second@example.invalid'};
        result = {account};
        break;
    case 'account/rateLimits/read':
        if (mode === 'switch' && reads === 1) {
            console.log('{broken');
            break;
        }
        result = {rateLimitsByLimitId: {codex: {
            primary: {usedPercent: 37.5 + reads++, windowDurationMins: 300, resetsAt: now + 2 * 3600},
            secondary: {usedPercent: 16, windowDurationMins: 10080, resetsAt: now + 6 * 86400 + 5 * 3600},
        }}};
        break;
    case 'account/login/start':
        if (params.type !== 'chatgpt')
            throw new Error('Unexpected sign-in type');
        result = {type: 'chatgpt', loginId: 'test', authUrl: process.env.FAKE_AUTH_URL};
        break;
    case 'account/login/cancel':
        if (params.loginId !== 'test')
            throw new Error('Unexpected login ID');
        break;
    case 'account/logout':
        account = null;
        break;
    default:
        throw new Error(`Unexpected method: ${method}`);
    }
    send({id, result});
}
