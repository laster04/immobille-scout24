import { CheerioCrawler, log } from '@crawlee/cheerio';
import { Actor } from 'apify';

import { BASIC_HEADERS, DEFAULT_END_PAGE, LABELS, LISTING_BODY, PAGE_SIZE } from './consts.js';
import {
    getRealEstateTypeOperation,
    getSearchUrl,
    getShapeSearchUrl,
    parseShapeUrl,
    parseWebSearchUrl,
} from './ListingSearchHelper.js';
import { handleDistrictSearch, handleProperty, handlePropertyList } from './routes.js';

await Actor.init();

const userInput = (await Actor.getInput()) ?? {};
const {
    startUrl = [],
    district = null,
    onlyNewest = false,
    proxy,
    debugLog = false,
    country = 'de',
    operation = 'sale',
    propertyType = 'apartment',
} = userInput;

if (debugLog) {
    log.setLevel(log.LEVELS.DEBUG);
}

// Nullable number inputs arrive as `null` when the user clears the field in the console.
// Passing that on unchecked crashes the crawler constructor (`maxRequestsPerCrawl`)
// or silently disables a limit comparison (`0 >= null` is true), so normalize here.
const toPositiveNumber = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
const maxItems = toPositiveNumber(userInput.maxItems);
const endPage = toPositiveNumber(userInput.endPage) ?? DEFAULT_END_PAGE;
const minPrice = toPositiveNumber(userInput.minPrice);
const maxPrice = toPositiveNumber(userInput.maxPrice);

const normalizedInput = { ...userInput, maxItems, endPage, minPrice, maxPrice, country, operation, propertyType };

if (!district && startUrl.length === 0) {
    await Actor.fail('You have to input district param or any startUrls to run crawler..');
}

const proxyConfiguration = await Actor.createProxyConfiguration(proxy);
const requestQueue = await Actor.openRequestQueue();

let enqueuedStartRequests = 0;

// Throws with a readable reason for an unusable URL — the caller decides whether to skip or fail
const buildStartRequest = (url) => {
    if (url.match(/\/expose/)) {
        const propertyId = url.match(/expose\/([a-zA-Z\d]+)/)?.[1];
        if (!propertyId) {
            throw new Error('could not read a property id out of the URL');
        }
        return {
            url: `https://api.mobile.immobilienscout24.de/expose/${propertyId}`,
            method: 'GET',
            headers: BASIC_HEADERS,
            userData: {
                label: LABELS.PROPERTY,
                requestPayload: { operation },
            },
        };
    }

    if (url.match(/\/Suche\/shape\//)) {
        const parsed = parseShapeUrl(url);
        const resolvedPropertyType = parsed.propertyType ?? propertyType;
        const resolvedOperation = parsed.operation ?? operation;

        return {
            url: getShapeSearchUrl({
                shape: parsed.shape,
                realestateType: resolvedPropertyType,
                operation: resolvedOperation,
                pageNumber: 1,
                min: minPrice,
                max: maxPrice,
                extraParams: parsed.queryParams,
            }),
            method: 'GET',
            uniqueKey: `shape-${parsed.shape}-1`,
            headers: BASIC_HEADERS,
            userData: {
                label: LABELS.PROPERTY_LIST,
                requestPayload: {
                    shape: parsed.shape,
                    pageNumber: 1,
                    enqueuedItems: 0,
                    ...normalizedInput,
                    propertyType: resolvedPropertyType,
                    operation: resolvedOperation,
                    extraParams: parsed.queryParams,
                },
            },
        };
    }

    if (url.match(/\/Suche\//)) {
        const parsed = parseWebSearchUrl(url);
        const resolvedPropertyType = parsed.propertyType ?? propertyType;
        const resolvedOperation = parsed.operation ?? operation;

        return {
            url: getSearchUrl({
                geocodes: parsed.geopath,
                realestateType: resolvedPropertyType,
                operation: resolvedOperation,
                pageNumber: 1,
                min: minPrice,
                max: maxPrice,
                extraParams: parsed.queryParams,
            }),
            method: 'POST',
            uniqueKey: `${parsed.geopath}-1`,
            payload: JSON.stringify(LISTING_BODY),
            headers: BASIC_HEADERS,
            userData: {
                label: LABELS.PROPERTY_LIST,
                requestPayload: {
                    geopath: parsed.geopath,
                    pageNumber: 1,
                    enqueuedItems: 0,
                    ...normalizedInput,
                    propertyType: resolvedPropertyType,
                    operation: resolvedOperation,
                    extraParams: parsed.queryParams,
                },
            },
        };
    }

    throw new Error('not an immobilienscout24.de search, shape or expose URL');
};

if (district && startUrl.length === 0) {
    // Fail fast with a readable message instead of retrying an impossible search eight times
    try {
        getRealEstateTypeOperation(propertyType, operation);
    } catch (err) {
        await Actor.fail(err.message);
    }

    const url = `https://api.mobile.immobilienscout24.de/geo/autocomplete?s=&nextgen=true&c=${country}&i=${district}`;

    await requestQueue.addRequest({
        url,
        headers: BASIC_HEADERS,
        userData: {
            label: LABELS.DISTRICT_SEARCH,
            district,
            country,
            userInput: {
                propertyType,
                minPrice,
                maxPrice,
                operation,
            },
        },
    });
    enqueuedStartRequests++;
}

for (const { url } of startUrl) {
    // One malformed or unsupported URL must not take the whole run down
    try {
        await requestQueue.addRequest(buildStartRequest(url));
        enqueuedStartRequests++;
    } catch (err) {
        log.warning(`Skipping startUrl "${url}": ${err.message}`);
    }
}

if (enqueuedStartRequests === 0) {
    await Actor.fail('None of the provided startUrls could be used, there is nothing to scrape.');
}

// `maxItems` caps dataset items, not requests — leave headroom for the search pages
// (one per PAGE_SIZE properties) so the crawler is not shut down before the items are collected.
const maxRequestsPerCrawl = maxItems ? maxItems + Math.ceil(maxItems / PAGE_SIZE) + 5 : undefined;

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    maxConcurrency: 10,
    maxRequestRetries: 8,
    requestQueue,
    async requestHandler(context) {
        const {
            url,
            userData: { label },
        } = context.request;
        log.info('Page opened.', {
            label,
            url,
        });

        switch (label) {
            case LABELS.DISTRICT_SEARCH:
                return handleDistrictSearch(context, proxyConfiguration);
            case LABELS.PROPERTY_LIST:
                return handlePropertyList(context, {
                    userInput: normalizedInput,
                    onlyNewest,
                });
            case LABELS.PROPERTY:
                return handleProperty(context, proxyConfiguration);
            default:
                return log.warning('Unknown label');
        }
    },
    failedRequestHandler({ request }, error) {
        // Without this, blocked or broken requests only show up as a green run with no data
        log.error(`Request failed after ${request.retryCount} retries: ${request.url}`, { error: error.message });
    },
});

log.info('Starting the crawl.');
await crawler.run();

await Actor.exit();
