const BASE_SEARCH_URL =
    'https://api.mobile.immobilienscout24.de/search/list?features=adKeysAndStringValues,virtualTour,contactDetails,additionalImages,viareporting,nextgen,calculatedTotalRent,listingsInListFirstSummary,xxlListingType,quickfilters,grouping,projectsInAllRealestateTypes,fairPrice&pagesize=20&searchType=region&sorting=standard&channel=is24';
const BASE_SHAPE_URL =
    'https://api.mobile.immobilienscout24.de/search/list?features=adKeysAndStringValues,virtualTour,contactDetails,additionalImages,viareporting,nextgen,calculatedTotalRent,listingsInListFirstSummary,xxlListingType,quickfilters,grouping,projectsInAllRealestateTypes,fairPrice&pagesize=20&searchType=shape&sorting=standard&channel=is24';
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

export function getShapeSearchUrl(inputQuery) {
    const { shape, realestateType, operation, pageNumber = 1, min = null, max = null, extraParams = {} } = inputQuery;
    const realEstateQuery = getRealEstateTypeOperation(realestateType, operation);
    const priceQuery = 'price' in extraParams ? null : getPriceFilter(min, max);

    let url = `${BASE_SHAPE_URL}&shape=${encodeURIComponent(shape)}&pagenumber=${pageNumber}&${realEstateQuery}`;

    if (priceQuery) url += `&${priceQuery}`;

    for (const [key, value] of Object.entries(extraParams)) {
        url += `&${key}=${value}`;
    }

    return url;
}

export function getSearchUrl(inputQuery) {
    const {
        geocodes,
        realestateType,
        operation,
        pageNumber = 1,
        min = null,
        max = null,
        extraParams = {},
    } = inputQuery;
    const realEstateQuery = getRealEstateTypeOperation(realestateType, operation);

    // Skip built-in price filter if the web URL already provides a price param
    const priceQuery = 'price' in extraParams ? null : getPriceFilter(min, max);

    let url = `${BASE_SEARCH_URL}&geocodes=${geocodes}&pagenumber=${pageNumber}&${realEstateQuery}`;

    if (priceQuery) url += `&${priceQuery}`;

    for (const [key, value] of Object.entries(extraParams)) {
        url += `&${key}=${value}`;
    }

    return url;
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
