/* eslint-disable no-console, no-control-regex -- CLI scripts that print and strip ANSI colours */
// Downloads the latest run of each task in example-tasks.json (or of the tasks named on the
// command line) into tasks/runs/<task>/: run.json (stats, usage, charged events), log.txt
// and items.json. Prints one summary line per run. tasks/runs/ is gitignored.
//
// Usage: APIFY_TOKEN=<token> node tasks/download-runs.mjs [task-name ...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://api.apify.com/v2';
const token = process.env.APIFY_TOKEN;

if (!token) {
    console.error('Set APIFY_TOKEN (Apify Console → Settings → API & Integrations).');
    process.exit(1);
}

const names = process.argv.slice(2).length
    ? process.argv.slice(2)
    : JSON.parse(readFileSync(new URL('./example-tasks.json', import.meta.url), 'utf8')).map((task) => task.name);

const get = async (path, { raw = false } = {}) => {
    const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`);
    return raw ? response.text() : (await response.json()).data;
};

const { username } = await get('/users/me');

for (const name of names) {
    const [latest] = (await get(`/actor-tasks/${username}~${name}/runs?desc=1&limit=1`).catch(() => ({ items: [] })))
        .items;

    if (!latest) {
        console.log(`${name}: no run`);
        continue;
    }

    const run = await get(`/actor-runs/${latest.id}`);
    const dir = new URL(`./runs/${name}/`, import.meta.url);
    mkdirSync(dir, { recursive: true });

    writeFileSync(new URL('run.json', dir), JSON.stringify(run, null, 2));
    writeFileSync(
        new URL('log.txt', dir),
        (await get(`/logs/${run.id}`, { raw: true })).replace(/\x1b\[[0-9;]*m/g, ''),
    );

    let items = null;
    if (!['READY', 'RUNNING'].includes(run.status)) {
        const text = await get(`/datasets/${run.defaultDatasetId}/items?clean=1`, { raw: true });
        writeFileSync(new URL('items.json', dir), text);
        items = JSON.parse(text).length;
    }

    const usd = run.usageTotalUsd ?? 0;
    const proxy = run.usageUsd?.PROXY_RESIDENTIAL_TRANSFER_GBYTES ?? 0;
    console.log(
        [
            name.padEnd(36),
            run.status.padEnd(9),
            `build ${run.buildNumber}`,
            `${Math.round(run.stats?.runTimeSecs ?? 0)} s`,
            `${run.options?.memoryMbytes} MB`,
            `items ${items ?? '-'}`,
            `$${usd.toFixed(3)}`,
            items ? `$${((usd / items) * 1000).toFixed(2)}/1k` : '',
            `proxy $${proxy.toFixed(3)}`,
            `charged ${JSON.stringify(run.chargedEventCounts ?? {})}`,
        ].join('  '),
    );
}
