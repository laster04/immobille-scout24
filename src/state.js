import crypto from 'node:crypto';

import { log } from '@crawlee/cheerio';
import { Actor } from 'apify';

// Run-wide bookkeeping shared by every handler. `maxItems` caps the whole run (not each search),
// and overlapping start URLs return the same listing, so every expose id is claimed exactly once.
// Kept in the default key-value store, so it survives a platform migration.
const RUN_STATE_KEY = 'RUN_STATE';
// Named store - it outlives the run, which is what monitoring mode needs.
const MONITORING_STORE_NAME = 'immoscout24-monitoring';
// Built-in pay-per-event event the platform charges for every default-dataset item.
const DATASET_ITEM_EVENT = 'apify-default-dataset-item';

let itemLimit = Infinity;
let runState = { count: 0, pushed: 0, claimed: {}, budget: null };
let monitoring = null;
let stopped = false;

/** sha1 of the search definition - a changed search gets its own list of seen listings. */
export const monitoringKey = (searchDefinition) =>
    `SEEN-${crypto.createHash('sha1').update(JSON.stringify(searchDefinition)).digest('hex').slice(0, 16)}`;

/** Items the user's max charge still pays for, per the SDK. Infinity when the run is not pay-per-event. */
const sdkChargeableItems = () => {
    try {
        return Actor.getChargingManager().calculateMaxEventChargeCountWithinLimit(DATASET_ITEM_EVENT);
    } catch {
        return Infinity;
    }
};

export const initRunState = async ({ maxItems, monitoringMode, searchDefinition }) => {
    itemLimit = maxItems > 0 ? maxItems : Infinity;
    const defaultStore = await Actor.openKeyValueStore();
    runState = await defaultStore.getAutoSavedValue(RUN_STATE_KEY, { count: 0, pushed: 0, claimed: {} });
    // Taken once and saved, so a migrated run doesn't subtract its earlier items twice.
    // JSON has no Infinity - null means "no cap".
    if (runState.budget === undefined) {
        const items = sdkChargeableItems();
        runState.budget = Number.isFinite(items) ? items : null;
        if (runState.budget != null) log.info(`Your maximum charge for this run covers ${runState.budget} results.`);
    }

    if (monitoringMode) {
        const key = monitoringKey(searchDefinition);
        const store = await Actor.openKeyValueStore(MONITORING_STORE_NAME);
        const known = await store.getAutoSavedValue(key, {});
        monitoring = { store, key, known };
        log.info(
            `Monitoring mode: ${Object.keys(known).length} listings known from previous runs, only new ones will be returned.`,
            { key },
        );
    }
};

export const isMonitoring = () => monitoring != null;

/**
 * How many more listings the user's maximum charge for this run still pays for, counting the ones
 * already claimed whose detail request is still queued. Two sources, the lower wins: the budget
 * taken at the start minus every claim (works even where the SDK does not track the platform's
 * dataset-item event), and the SDK's live figure minus the claims not pushed yet.
 */
const chargeableLeft = () => {
    const fromBudget = runState.budget == null ? Infinity : runState.budget - runState.count;
    return Math.min(fromBudget, sdkChargeableItems() - (runState.count - runState.pushed));
};

/**
 * Decides whether a listing should be scraped. 'ok' claims it and counts it toward `maxItems`;
 * 'duplicate', 'known' (monitoring), 'limit' and 'budget' (max charge) mean skip it.
 * Synchronous on purpose - concurrent handlers cannot both claim the same listing.
 * `ignoreKnown` returns a listing even if a previous monitoring run already did (pasted expose URLs).
 */
export const claimListing = (id, { ignoreKnown = false } = {}) => {
    const key = String(id);
    if (runState.claimed[key]) return 'duplicate';
    if (!ignoreKnown && monitoring?.known[key]) return 'known';
    if (runState.count >= itemLimit) return 'limit';
    if (chargeableLeft() <= 0) return 'budget';
    runState.claimed[key] = 1;
    runState.count++;
    return 'ok';
};

/** Gives a claim back when its detail request failed for good, so it no longer counts as pending. */
export const releaseListing = (id) => {
    const key = String(id);
    if (!runState.claimed[key]) return;
    delete runState.claimed[key];
    runState.count--;
};

/** True once nothing more can be returned: `maxItems` reached or the user's max charge used up. */
export const runIsFull = () => runState.count >= itemLimit || chargeableLeft() <= 0;

/**
 * Pushes (and so charges) one listing. Once the user's max charge for the run is reached the
 * crawler is stopped - the SDK drops further items but would keep paying for requests.
 */
export const pushListing = async (crawler, item) => {
    await Actor.pushData(item);
    runState.pushed++;
    if (monitoring && item.id != null) monitoring.known[String(item.id)] = 1;

    const budgetUsed = runState.budget != null && runState.pushed >= runState.budget;
    if ((budgetUsed || sdkChargeableItems() <= 0) && !stopped) {
        stopped = true;
        log.warning('Maximum charge for this run reached - stopping the crawl.');
        crawler.stop('Maximum charge for this run reached.');
    }
};

export const saveMonitoring = async () => {
    if (!monitoring) return;
    await monitoring.store.setValue(monitoring.key, monitoring.known);
    log.info(`Monitoring mode: ${Object.keys(monitoring.known).length} listings saved for the next run.`, {
        key: monitoring.key,
    });
};
