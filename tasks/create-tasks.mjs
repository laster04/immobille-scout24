/* eslint-disable no-console -- CLI script that prints its progress */
// Creates (or updates, matched by name) the example tasks from example-tasks.json in your
// Apify account. Tasks start private. To show one on the Store, fill in its Publication tab
// in Apify Console, then run `apify task publish <name>`.
//
// Usage: APIFY_TOKEN=<token> node tasks/create-tasks.mjs [--dry-run] [--only=name1,name2]
import { readFileSync } from 'node:fs';

const ACTOR_ID = 'lukass~immobilien-scout24';
const API = 'https://api.apify.com/v2';
const PROXY = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] };

const allTasks = JSON.parse(readFileSync(new URL('./example-tasks.json', import.meta.url), 'utf8'));
const dryRun = process.argv.includes('--dry-run');
// --only=name1,name2 limits the run to those tasks, so tasks edited in Console are not overwritten.
const only = process.argv
    .find((arg) => arg.startsWith('--only='))
    ?.slice('--only='.length)
    .split(',')
    .filter(Boolean);
const tasks = only ? allTasks.filter((task) => only.includes(task.name)) : allTasks;
const unknown = (only ?? []).filter((name) => !allTasks.some((task) => task.name === name));
if (unknown.length > 0) {
    console.error(`Unknown task names: ${unknown.join(', ')}`);
    process.exit(1);
}
const token = process.env.APIFY_TOKEN;

if (dryRun) {
    for (const task of tasks) console.log(`${task.name}  ${JSON.stringify({ proxy: PROXY, ...task.input })}`);
    process.exit(0);
}
if (!token) {
    console.error('Set APIFY_TOKEN (Apify Console → Settings → API & Integrations).');
    process.exit(1);
}

const api = async (method, path, body) => {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(`${method} ${path}: HTTP ${response.status} ${json.error?.message ?? ''}`);
        error.status = response.status;
        throw error;
    }
    return json.data;
};

const { username } = await api('GET', '/users/me');

for (const task of tasks) {
    const payload = {
        name: task.name,
        title: task.title,
        description: task.description,
        input: { proxy: PROXY, ...task.input },
    };
    const existing = await api('GET', `/actor-tasks/${username}~${task.name}`).catch((err) => {
        if (err.status === 404) return null;
        throw err;
    });

    if (existing) {
        await api('PUT', `/actor-tasks/${existing.id}`, payload);
        console.log(`updated  ${task.name}`);
    } else {
        await api('POST', '/actor-tasks', { actId: ACTOR_ID, ...payload });
        console.log(`created  ${task.name}`);
    }
}

console.log(
    `\nDone - ${tasks.length} tasks. Publish each from its Publication tab in Apify Console (title and description are in example-tasks.json).`,
);
