import { SORTING_MAP } from './consts.js';

const BASE_URL =
    'https://api.mobile.immobilienscout24.de/search/list?features=adKeysAndStringValues,virtualTour,contactDetails,additionalImages,viareporting,nextgen,calculatedTotalRent,listingsInListFirstSummary,xxlListingType,quickfilters,grouping,projectsInAllRealestateTypes,fairPrice&pagesize=20&channel=is24';
const BASE_SEARCH_URL = `${BASE_URL}&searchType=region`;
const BASE_SHAPE_URL = `${BASE_URL}&searchType=shape`;
const BASE_RADIUS_URL = `${BASE_URL}&searchType=radius`;
const OPERATION_SALE = 'sale';

// Maps the last path segment of an immobilienscout24.de /Suche/ URL to propertyType + operation input values
const URL_SEGMENT_MAP = {
    'wohnung-kaufen': { propertyType: 'apartment', operation: 'sale' },
    'wohnung-mieten': { propertyType: 'apartment', operation: 'rent' },
    'haus-kaufen': { propertyType: 'house', operation: 'sale' },
    'haus-mieten': { propertyType: 'house', operation: 'rent' },
    'grundstueck-kaufen': { propertyType: 'plot', operation: 'sale' },
    'grundstueck-mieten': { propertyType: 'plot', operation: 'rent' },
    'garage-kaufen': { propertyType: 'garage', operation: 'sale' },
    'garage-mieten': { propertyType: 'garage', operation: 'rent' },
    'wg-zimmer': { propertyType: 'flatshareroom', operation: 'rent' },
    kurzzeitvermietung: { propertyType: 'shorttermaccommodation', operation: 'rent' },
    'anlage-kaufen': { propertyType: 'investment', operation: 'sale' },
    zwangsversteigerung: { propertyType: 'compulsoryauction', operation: 'sale' },
    'bueroflaeche-kaufen': { propertyType: 'office', operation: 'sale' },
    'bueroflaeche-mieten': { propertyType: 'office', operation: 'rent' },
    'einzelhandel-kaufen': { propertyType: 'store', operation: 'sale' },
    'einzelhandel-mieten': { propertyType: 'store', operation: 'rent' },
    'hallen-kaufen': { propertyType: 'industry', operation: 'sale' },
    'hallen-mieten': { propertyType: 'industry', operation: 'rent' },
    'gastgewerbe-kaufen': { propertyType: 'gastronomy', operation: 'sale' },
    'gastgewerbe-mieten': { propertyType: 'gastronomy', operation: 'rent' },
    'gewerbegrundst-kaufen': { propertyType: 'tradesite', operation: 'sale' },
    'gewerbegrundst-mieten': { propertyType: 'tradesite', operation: 'rent' },
    'sonderimmo-kaufen': { propertyType: 'specialpurpose', operation: 'sale' },
    'sonderimmo-mieten': { propertyType: 'specialpurpose', operation: 'rent' },
};

// SEO variants of the slugs above ('wohnung-mit-balkon-mieten', 'haus-kaufen-mit-garten', ...) are not
// in URL_SEGMENT_MAP, but they still encode the type in the first token and the operation in the suffix.
const SLUG_PREFIX_TYPE = {
    wohnung: 'apartment',
    haus: 'house',
    grundstueck: 'plot',
    garage: 'garage',
    anlage: 'investment',
    bueroflaeche: 'office',
    einzelhandel: 'store',
    hallen: 'industry',
    gastgewerbe: 'gastronomy',
    gewerbegrundst: 'tradesite',
    sonderimmo: 'specialpurpose',
};
const SLUG_OPERATION = { kaufen: 'sale', mieten: 'rent' };

// Params we set explicitly — skip if they appear in web URL query string
const INTERNAL_PARAMS = new Set([
    'realestatetype',
    'geocodes',
    'pagenumber',
    'pagesize',
    'searchType',
    'sorting',
    'channel',
    'features',
    'priceType',
]);

/**
 * Recognizes the property type / operation slug at the end of a /Suche/ path.
 * Returns `null` when the segment is not a type slug at all (then it is part of the geopath).
 */
function parseTypeSlug(segment) {
    if (URL_SEGMENT_MAP[segment]) {
        return { ...URL_SEGMENT_MAP[segment] };
    }

    const tokens = segment.split('-');
    const operation = tokens.map((token) => SLUG_OPERATION[token]).find(Boolean);
    if (!operation) {
        return null;
    }

    const propertyType = SLUG_PREFIX_TYPE[tokens[0]];
    return propertyType ? { propertyType, operation } : { operation };
}

function collectQueryParams(urlObj, skipKeys = []) {
    const queryParams = {};
    for (const [key, value] of urlObj.searchParams) {
        if (!INTERNAL_PARAMS.has(key) && !skipKeys.includes(key)) {
            queryParams[key] = value;
        }
    }
    return queryParams;
}

/**
 * Parses a web search URL from immobilienscout24.de and returns the geopath,
 * propertyType, operation, and any filter query params to forward to the API.
 */
export function parseWebSearchUrl(url) {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.replace('/Suche/', '').split('/').filter(Boolean);
    const segment = parts[parts.length - 1];
    const typeInfo = segment ? parseTypeSlug(segment) : null;

    // Only a recognized type slug is stripped — otherwise the last segment belongs to the geopath
    const geoParts = typeInfo ? parts.slice(0, -1) : parts;
    if (geoParts.length === 0) {
        throw new Error(`Could not read a location out of the search URL "${url}"`);
    }

    return { geopath: `/${geoParts.join('/')}`, queryParams: collectQueryParams(urlObj), ...(typeInfo ?? {}) };
}

/**
 * Website URLs encode the polyline as base64url; the API expects the raw polyline.
 * Buffer.from() silently drops characters outside the base64 alphabet, so decode only
 * when the result re-encodes to the exact same string — otherwise the param already is a polyline.
 */
function decodeShape(shapeEncoded) {
    const decoded = Buffer.from(shapeEncoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const reEncoded = Buffer.from(decoded, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return reEncoded === shapeEncoded.replace(/=+$/, '') ? decoded : shapeEncoded;
}

export function parseShapeUrl(url) {
    const urlObj = new URL(url);
    const shapeEncoded = urlObj.searchParams.get('shape');
    if (!shapeEncoded) {
        throw new Error(`Shape search URL "${url}" is missing the "shape" query parameter`);
    }
    const shape = decodeShape(shapeEncoded);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    const shapeIdx = parts.indexOf('shape');
    const slug = parts[shapeIdx + 1] ?? '';
    const typeInfo = slug ? parseTypeSlug(slug) : null;

    return { shape, queryParams: collectQueryParams(urlObj, ['shape']), ...(typeInfo ?? {}) };
}

/**
 * Turns the actor's own filter inputs into API query params (verified against the mobile API).
 * Params parsed off a pasted website URL win over these — see `buildSearchQuery`.
 */
export function buildFilterParams(input = {}) {
    const params = {};
    const range = (min, max, decimals = 0) => {
        if (min == null && max == null) return null;
        const fmt = (v) => (v == null ? '' : Number(v).toFixed(decimals));
        return `${fmt(min)}-${fmt(max)}`;
    };

    const rooms = range(input.minRooms, input.maxRooms, 1);
    if (rooms) params.numberofrooms = rooms;

    const livingSpace = range(input.minSize, input.maxSize, 1);
    if (livingSpace) params.livingspace = livingSpace;

    const constructionYear = range(input.minConstructionYear, input.maxConstructionYear);
    if (constructionYear) params.constructionyear = constructionYear;

    if (Array.isArray(input.equipment) && input.equipment.length > 0) {
        params.equipment = input.equipment.join(',');
    }
    if (input.petsAllowed) {
        params.petsallowedtypes = 'yes';
    }
    if (input.excludeNewBuildProjects) {
        params.exclusioncriteria = 'projectlisting';
    }

    const sorting = SORTING_MAP[input.sortBy ?? 'default'];
    if (sorting) params.sorting = sorting;

    return params;
}

/**
 * Shared query tail for every search type: property type + operation, price, filters.
 * `extraParams` (taken off a pasted website URL) overrides the actor's own filter inputs,
 * because the pasted URL is the more specific instruction.
 */
function buildSearchQuery({
    realestateType,
    operation,
    pageNumber = 1,
    min = null,
    max = null,
    extraParams = {},
    filters = {},
}) {
    const realEstateQuery = getRealEstateTypeOperation(realestateType, operation);
    const merged = { sorting: 'standard', ...filters, ...extraParams };

    // Skip the built-in price filter if the web URL already provides a price param
    const priceQuery = 'price' in merged ? null : getPriceFilter(min, max);

    let query = `pagenumber=${pageNumber}&${realEstateQuery}`;
    if (priceQuery) query += `&${priceQuery}`;
    for (const [key, value] of Object.entries(merged)) {
        query += `&${key}=${value}`;
    }
    return query;
}

export function getShapeSearchUrl(inputQuery) {
    return `${BASE_SHAPE_URL}&shape=${encodeURIComponent(inputQuery.shape)}&${buildSearchQuery(inputQuery)}`;
}

export function getSearchUrl(inputQuery) {
    return `${BASE_SEARCH_URL}&geocodes=${inputQuery.geocodes}&${buildSearchQuery(inputQuery)}`;
}

/** Radius search around a point: the API wants `lat;lng;radiusInKm` in a single param. */
export function getRadiusSearchUrl(inputQuery) {
    const { latitude, longitude, radiusKm } = inputQuery;
    const coordinates = `${latitude};${longitude};${Number(radiusKm).toFixed(1)}`;
    return `${BASE_RADIUS_URL}&geocoordinates=${encodeURIComponent(coordinates)}&${buildSearchQuery(inputQuery)}`;
}

/**
 * The same search URL can appear twice with a different property type, and Crawlee would dedupe
 * the second one away, so every search request gets a hand-built key covering type + page.
 */
export function searchUniqueKey({ shape, geopath, geocoordinates, propertyType, operation, pageNumber = 1 }) {
    const scope = shape ? `shape-${shape}` : (geocoordinates ?? geopath);
    return `${scope}-${pageNumber}-${propertyType}-${operation}`;
}

export function getRealEstateTypeOperation(realestateType, operation) {
    switch (realestateType) {
        case 'apartment':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=apartmentbuy';
            }
            return 'realestatetype=apartmentrent&priceType=calculatedtotalrent';

        case 'house':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=housebuy';
            }
            return 'realestatetype=houserent';

        case 'plot':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=livingbuysite&priceType=buy';
            }
            return 'realestatetype=livingrentsite&priceType=rent';

        case 'solid-house':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=housetype&priceType=buy';
            }
            throw new Error("Can't use rent for Solid house - Property type");

        case 'shorttermaccommodation':
            if (operation === OPERATION_SALE) {
                throw new Error("Can't use sale for Temporary living - Property type");
            } else {
                return 'realestatetype=shorttermaccommodation';
            }
        case 'flatshareroom':
            if (operation === OPERATION_SALE) {
                throw new Error("Can't use sale for Shared flat - Property type");
            } else {
                return 'realestatetype=flatshareroom';
            }
        case 'garage':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=garagebuy';
            }
            return 'realestatetype=garagerent';

        case 'office':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=office';
            }
            return 'priceType=rentpermonth&realestatetype=office';

        case 'store':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=store';
            }
            return 'priceType=rentpermonth&realestatetype=store';

        case 'industry':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=industry';
            }
            return 'priceType=rentpermonth&realestatetype=industry';

        case 'gastronomy':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=industry';
            }
            return 'priceType=lease&realestatetype=industry';

        case 'tradesite':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=tradesite';
            }
            return 'priceType=rent&realestatetype=tradesite';

        case 'specialpurpose':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=specialpurpose';
            }
            return 'priceType=rentpermonth&realestatetype=specialpurpose';

        case 'investment':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=investment';
            }
            throw new Error("Can't use rent for Investment - Property type");

        case 'compulsoryauction':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=compulsoryauction';
            }
            throw new Error("Can't use rent for Compulsory auction - Property type");

        default:
            throw new Error(`Unknown property type "${realestateType}"`);
    }
}

function getPriceFilter(min, max) {
    let priceQuery = '-';

    if (min != null) {
        priceQuery = `${min}${priceQuery}`;
    }
    if (max != null) {
        priceQuery = `${priceQuery}${max}`;
    }
    return `price=${priceQuery}`;
}
