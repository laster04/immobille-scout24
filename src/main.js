import { CheerioCrawler, log } from '@crawlee/cheerio';
import { Actor } from 'apify';

import { BASIC_HEADERS, DEFAULT_END_PAGE, LABELS, LISTING_BODY, PAGE_SIZE } from './consts.js';
import {
    buildFilterParams,
    getRadiusSearchUrl,
    getRealEstateTypeOperation,
    getSearchUrl,
    getShapeSearchUrl,
    parseShapeUrl,
    parseWebSearchUrl,
    searchUniqueKey,
} from './ListingSearchHelper.js';
import { handleDistrictSearch, handleProperty, handlePropertyList } from './routes.js';

await Actor.init();

const userInput = (await Actor.getInput()) ?? {};
const {
    startUrl = [],
    district = null,
    coordinates = null,
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
const radiusKm = toPositiveNumber(userInput.radiusKm);

// "52.52, 13.405" -> { latitude, longitude }; the input schema has no float field, so this arrives as text
const parseCoordinates = (value) => {
    const [latitude, longitude] = String(value ?? '')
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map(Number);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};
const point = coordinates ? parseCoordinates(coordinates) : null;
if (coordinates && !point) {
    await Actor.fail(`Could not read coordinates out of "${coordinates}" — expected something like "52.52, 13.405".`);
}

// rooms / size / year / equipment / sorting inputs → API query params.
// A pasted website URL overrides these, see `buildSearchQuery` in ListingSearchHelper.js.
const filters = buildFilterParams(userInput);

const normalizedInput = {
    ...userInput,
    maxItems,
    endPage,
    minPrice,
    maxPrice,
    country,
    operation,
    propertyType,
    filters,
};

const hasCoordinates = point != null && radiusKm != null;

if (!district && !hasCoordinates && startUrl.length === 0) {
    await Actor.fail(
        'Nothing to scrape — provide startUrl(s), a Location, or latitude + longitude + radius for a radius search.',
    );
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

    const isShape = Boolean(url.match(/\/Suche\/shape\//));
    if (!isShape && !url.match(/\/Suche\//)) {
        throw new Error('not an immobilienscout24.de search, shape or expose URL');
    }

    const parsed = isShape ? parseShapeUrl(url) : parseWebSearchUrl(url);
    const resolvedPropertyType = parsed.propertyType ?? propertyType;
    const resolvedOperation = parsed.operation ?? operation;
    const searchQuery = {
        realestateType: resolvedPropertyType,
        operation: resolvedOperation,
        pageNumber: 1,
        min: minPrice,
        max: maxPrice,
        filters,
        extraParams: parsed.queryParams,
    };
    const requestPayload = {
        ...(isShape ? { shape: parsed.shape } : { geopath: parsed.geopath }),
        pageNumber: 1,
        enqueuedItems: 0,
        ...normalizedInput,
        propertyType: resolvedPropertyType,
        operation: resolvedOperation,
        extraParams: parsed.queryParams,
    };

    return {
        url: isShape
            ? getShapeSearchUrl({ ...searchQuery, shape: parsed.shape })
            : getSearchUrl({ ...searchQuery, geocodes: parsed.geopath }),
        // Shape search is a POST too — the same URL as a GET answers {"error":"what???"}
        method: 'POST',
        uniqueKey: searchUniqueKey(requestPayload),
        payload: JSON.stringify(LISTING_BODY),
        headers: BASIC_HEADERS,
        userData: {
            label: LABELS.PROPERTY_LIST,
            requestPayload,
        },
    };
};

// Fail fast with a readable message instead of retrying an impossible search eight times
if (startUrl.length === 0) {
    try {
        getRealEstateTypeOperation(propertyType, operation);
    } catch (err) {
        await Actor.fail(err.message);
    }
}

if (hasCoordinates && startUrl.length === 0) {
    const geocoordinates = { ...point, radiusKm };
    const requestPayload = {
        geocoordinates,
        pageNumber: 1,
        enqueuedItems: 0,
        ...normalizedInput,
    };

    await requestQueue.addRequest({
        url: getRadiusSearchUrl({
            ...geocoordinates,
            realestateType: propertyType,
            operation,
            pageNumber: 1,
            min: minPrice,
            max: maxPrice,
            filters,
        }),
        method: 'POST',
        uniqueKey: searchUniqueKey({
            ...requestPayload,
            geocoordinates: `${point.latitude};${point.longitude};${radiusKm}`,
        }),
        payload: JSON.stringify(LISTING_BODY),
        headers: BASIC_HEADERS,
        userData: {
            label: LABELS.PROPERTY_LIST,
            requestPayload,
        },
    });
    enqueuedStartRequests++;
} else if (district && startUrl.length === 0) {
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
                maxItems,
                endPage,
                filters,
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
const maxRequestsPerCrawl = maxItems ? maxItems + Math.ceil(maxItems / PAGE_SIZE) + startUrl.length + 5 : undefined;

// Shared by every search request in the run so that `maxItems` caps the dataset as a whole
const createItemCounter = () => {
    let enqueued = 0;
    return {
        get count() {
            return enqueued;
        },
        increment() {
            enqueued++;
        },
    };
};
const counter = createItemCounter();

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
                return handlePropertyList(context, { userInput: normalizedInput, counter });
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
