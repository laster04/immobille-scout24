
const BASE_SEARCH_URL = 'https://api.mobile.immobilienscout24.de/search/list?features=adKeysAndStringValues,virtualTour,contactDetails,additionalImages,viareporting,nextgen,calculatedTotalRent,listingsInListFirstSummary,xxlListingType,quickfilters,grouping,projectsInAllRealestateTypes,fairPrice&pagesize=20&searchType=region&sorting=standard&channel=is24';
const BASE_SHAPE_URL = 'https://api.mobile.immobilienscout24.de/search/list?features=adKeysAndStringValues,virtualTour,contactDetails,additionalImages,viareporting,nextgen,calculatedTotalRent,listingsInListFirstSummary,xxlListingType,quickfilters,grouping,projectsInAllRealestateTypes,fairPrice&pagesize=20&searchType=shape&sorting=standard&channel=is24';
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
    'kurzzeitvermietung': { propertyType: 'shorttermaccommodation', operation: 'rent' },
    'anlage-kaufen': { propertyType: 'investment', operation: 'sale' },
    'zwangsversteigerung': { propertyType: 'compulsoryauction', operation: 'sale' },
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

// Params we set explicitly — skip if they appear in web URL query string
const INTERNAL_PARAMS = new Set(['realestatetype', 'geocodes', 'pagenumber', 'pagesize', 'searchType', 'sorting', 'channel', 'features', 'priceType']);

/**
 * Parses a web search URL from immobilienscout24.de and returns the geopath,
 * propertyType, operation, and any filter query params to forward to the API.
 */
export function parseWebSearchUrl(url) {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.replace('/Suche/', '').split('/').filter(Boolean);
    const segment = parts[parts.length - 1];
    const geopath = '/' + parts.slice(0, -1).join('/');

    const typeInfo = URL_SEGMENT_MAP[segment] ?? null;

    const queryParams = {};
    for (const [key, value] of urlObj.searchParams) {
        if (!INTERNAL_PARAMS.has(key)) {
            queryParams[key] = value;
        }
    }

    return { geopath, queryParams, ...(typeInfo ?? {}) };
}

export function parseShapeUrl(url) {
    const urlObj = new URL(url);
    const shapeEncoded = urlObj.searchParams.get('shape');
    // Website URL encodes polyline as base64url; API expects the raw polyline string
    const shape = Buffer.from(shapeEncoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parts = urlObj.pathname.split('/').filter(Boolean);
    const shapeIdx = parts.indexOf('shape');
    const slug = parts[shapeIdx + 1] ?? '';
    const typeInfo = URL_SEGMENT_MAP[slug] ?? null;

    const queryParams = {};
    for (const [key, value] of urlObj.searchParams) {
        if (!INTERNAL_PARAMS.has(key) && key !== 'shape') {
            queryParams[key] = value;
        }
    }

    return { shape, queryParams, ...(typeInfo ?? {}) };
}

export function getShapeSearchUrl(inputQuery) {
    const { shape, realestateType, operation, pageNumber = 1, min = null, max = null, extraParams = {} } = inputQuery;
    const realEstateQuery = getRealEstateTypeOperation(realestateType, operation);
    const priceQuery = 'price' in extraParams ? null : getPriceFilter(min, max);

    let url = BASE_SHAPE_URL
        + `&shape=${encodeURIComponent(shape)}`
        + `&pagenumber=${pageNumber}`
        + `&${realEstateQuery}`;

    if (priceQuery) url += `&${priceQuery}`;

    for (const [key, value] of Object.entries(extraParams)) {
        url += `&${key}=${value}`;
    }

    return url;
}

export function getSearchUrl(inputQuery) {
    const { geocodes, realestateType, operation, pageNumber = 1, min = null, max = null, extraParams = {} } = inputQuery;
    const realEstateQuery = getRealEstateTypeOperation(realestateType, operation);

    // Skip built-in price filter if the web URL already provides a price param
    const priceQuery = 'price' in extraParams ? null : getPriceFilter(min, max);

    let url = BASE_SEARCH_URL
        + `&geocodes=${geocodes}`
        + `&pagenumber=${pageNumber}`
        + `&${realEstateQuery}`;

    if (priceQuery) url += `&${priceQuery}`;

    for (const [key, value] of Object.entries(extraParams)) {
        url += `&${key}=${value}`;
    }

    return url;
}

function getRealEstateTypeOperation(realestateType, operation) {
    switch (realestateType) {
        case 'apartment':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=apartmentbuy';
            } else {
                return 'realestatetype=apartmentrent&priceType=calculatedtotalrent';
            }
        case 'house':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=housebuy';
            } else {
                return 'realestatetype=houserent';
            }
        case 'plot':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=livingbuysite&priceType=buy';
            } else {
                return 'realestatetype=livingrentsite&priceType=rent';
            }
        case 'solid-house':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=housetype&priceType=buy';
            } else {
                throw "Can't use rent for Solid house - Property type"
            }
        case 'shorttermaccommodation':
            if (operation === OPERATION_SALE) {
                throw "Can't use sale for Temporary living - Property type"
            } else {
                return 'realestatetype=shorttermaccommodation';
            }
        case 'flatshareroom':
            if (operation === OPERATION_SALE) {
                throw "Can't use sale for Shared flat - Property type"
            } else {
                return 'realestatetype=flatshareroom';
            }
        case 'garage':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=garagebuy';
            } else {
                return 'realestatetype=garagerent';
            }
        case 'office':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=office';
            } else {
                return 'priceType=rentpermonth&realestatetype=office';
            }
        case 'store':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=store';
            } else {
                return 'priceType=rentpermonth&realestatetype=store';
            }
        case 'industry':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=industry';
            } else {
                return 'priceType=rentpermonth&realestatetype=industry';
            }
        case 'gastronomy':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=industry';
            } else {
                return 'priceType=lease&realestatetype=industry';
            }
        case 'tradesite':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=tradesite';
            } else {
                return 'priceType=rent&realestatetype=tradesite';
            }
        case 'specialpurpose':
            if (operation === OPERATION_SALE) {
                return 'priceType=buy&realestatetype=specialpurpose';
            } else {
                return 'priceType=rentpermonth&realestatetype=specialpurpose';
            }
        case 'investment':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=investment';
            } else {
                throw "Can't use rent for Investment - Property type"
            }
        case 'compulsoryauction':
            if (operation === OPERATION_SALE) {
                return 'realestatetype=compulsoryauction';
            } else {
                throw "Can't use rent for Compulsory auction - Property type"
            }
    }
}

function getPriceFilter(min, max) {
    let priceQuery = "-";

    if (min != null) {
        priceQuery = `${min}${priceQuery}`;
    }
    if (max != null) {
        priceQuery = `${priceQuery}${max}`;
    }
    return `price=${priceQuery}`;
}
