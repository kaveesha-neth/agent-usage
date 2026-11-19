#!/usr/bin/env node
import {createInterface} from 'node:readline';

let initialized = false;
let account = {type: 'chatgpt', planType: 'plus', email: 'synthetic@example.invalid'};
let reads = 0;
for await (const line of createInterface({input: process.stdin})) {
    const {id, method, params} = JSON.parse(line);
    if (method === 'initialized') {
        initialized = true;
        continue;
    }
    if (method !== 'initialize' && !initialized)
        throw new Error('Request before app-server initialization');
    let result = {};
    switch (method) {
    case 'initialize':
        break;
    case 'account/read':
        result = {account};
        break;
    case 'account/rateLimits/read':
        result = {rateLimitsByLimitId: {codex: {
            primary: {usedPercent: 37.5 + reads++, windowDurationMins: 300, resetsAt: 4102444800},
            secondary: {usedPercent: 16, windowDurationMins: 10080, resetsAt: 4102444800},
        }}};
        break;
    case 'account/login/start':
        if (params.type !== 'chatgpt')
            throw new Error('Unexpected sign-in type');
        result = {loginId: 'test', authUrl: process.env.FAKE_AUTH_URL};
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
    console.log(JSON.stringify({id, result}));
}
