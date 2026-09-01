import { Dataset, log } from '@crawlee/cheerio';

import { BASIC_HEADERS, DEFAULT_END_PAGE, LABELS, LISTING_BODY } from './consts.js';
import { getSearchUrl, getShapeSearchUrl } from './ListingSearchHelper.js';

export const handleDistrictSearch = async (context) => {
    const {
        json,
        crawler: { requestQueue },
        request,
        request: { userData },
    } = context;
    const { userInput } = userData;
    const foundLocation = json.results?.[0];
    if (!foundLocation) {
        // Retrying an autocomplete that simply has no match would only burn time
        request.noRetry = true;
        throw new Error(`No location found for district "${userData.district}" in country "${userData.country}"`);
    }
    log.info(`Found ${json.results.length}`);
    log.info('Pick:', { data: foundLocation });

    const url = getSearchUrl({
        geocodes: foundLocation.geopath,
        realestateType: userInput.propertyType,
        operation: userInput.operation,
        pageNumber: 1,
        min: userInput.minPrice,
        max: userInput.maxPrice,
    });

    await requestQueue.addRequest({
        url,
        method: 'POST',
        uniqueKey: `${foundLocation.geopath}-1`,
        payload: JSON.stringify(LISTING_BODY),
        headers: BASIC_HEADERS,
        userData: {
            ...userData,
            label: LABELS.PROPERTY_LIST,
            requestPayload: {
                geopath: foundLocation.geopath,
                pageNumber: 1,
                enqueuedItems: 0,
                ...userInput,
            },
        },
    });
};

export const handlePropertyList = async (context, { userInput }) => {
    const {
        json,
        crawler: { requestQueue },
        request: { userData },
    } = context;
    if (!Array.isArray(json?.resultListItems)) {
        // e.g. an invalid shape polyline makes the API answer with {"error":"what???"}
        throw new Error(`Search API returned no result list: ${JSON.stringify(json).slice(0, 200)}`);
    }
    // `maxItems` / `endPage` are nullable in the input schema — the console sends `null` for a cleared field
    const maxItems = userInput.maxItems ?? Infinity;
    const endPage = userInput.endPage ?? DEFAULT_END_PAGE;
    const { requestPayload: body } = userData;

    // Count the properties actually enqueued instead of assuming every page was full
    let enqueuedItems = body.enqueuedItems ?? 0;
    for (const article of json.resultListItems) {
        if (enqueuedItems >= maxItems) {
            break;
        }
        if (article.type !== 'EXPOSE_RESULT') continue;

        await requestQueue.addRequest({
            url: `https://api.mobile.immobilienscout24.de/expose/${article.item.id}`,
            method: 'GET',
            headers: BASIC_HEADERS,
            userData: {
                ...userData,
                label: LABELS.PROPERTY,
            },
        });
        enqueuedItems++;
    }
    body.enqueuedItems = enqueuedItems;

    const page = body.pageNumber;
    if (page === 1) {
        log.info(`Total pageItems ${json.totalResults}`);
    }

    const hasMorePages = page < endPage && page < json.numberOfPages;
    if (enqueuedItems < maxItems && enqueuedItems < json.totalResults && hasMorePages) {
        body.pageNumber = page + 1;
        const url = body.shape
            ? getShapeSearchUrl({
                  shape: body.shape,
                  realestateType: body.propertyType,
                  operation: body.operation,
                  pageNumber: body.pageNumber,
                  min: body.minPrice,
                  max: body.maxPrice,
                  extraParams: body.extraParams ?? {},
              })
            : getSearchUrl({
                  geocodes: body.geopath,
                  realestateType: body.propertyType,
                  operation: body.operation,
                  pageNumber: body.pageNumber,
                  min: body.minPrice,
                  max: body.maxPrice,
                  extraParams: body.extraParams ?? {},
              });

        await requestQueue.addRequest({
            url,
            uniqueKey: body.shape
                ? `shape-${body.shape}-${body.pageNumber}`
                : `${body.geopath}-${body.pageNumber}-${body.propertyType}`,
            method: body.shape ? 'GET' : 'POST',
            ...(body.shape ? {} : { payload: JSON.stringify(LISTING_BODY) }),
            headers: BASIC_HEADERS,
            userData: {
                ...userData,
                label: LABELS.PROPERTY_LIST,
                requestPayload: body,
            },
        });
    }
};

/**
 * `obj_immotype` (e.g. "wohnung_kauf" / "wohnung_miete") tells sale from rent for the listing at hand,
 * which the input value cannot when a single expose URL is scraped.
 */
const inferOperation = (property, fallback) => {
    const params = property?.adTargetingParameters ?? {};
    const immotype = params.obj_immotype ?? '';
    if (immotype.includes('kauf')) return 'sale';
    if (immotype.includes('miete')) return 'rent';
    if (params.obj_purchasePrice) return 'sale';
    if (params.obj_baseRent ?? params.obj_rent) return 'rent';
    return fallback;
};

const handleOneProperty = (property, operation) => {
    const { adTargetingParameters, contact } = property;
    const output = {
        url: `https://www.immobilienscout24.de/expose/${property.header.id}`,
        id: property.header.id,
        operation,
        typology: adTargetingParameters.obj_typeOfFlat,
        price:
            operation === 'rent'
                ? (adTargetingParameters.obj_baseRent ?? adTargetingParameters.obj_rent)
                : adTargetingParameters?.obj_purchasePrice,
        size: adTargetingParameters.obj_livingSpace,
        condition: adTargetingParameters.obj_condition,
        availableFrom: adTargetingParameters.obj_availableFrom,
        contacts: {
            commercialName: contact.contactData.agent.company,
            contactName: contact.contactData.agent.name,
            rating: contact.contactData.agent.rating.label,
            phones: contact.phoneNumbers.map((c) => c.text),
        },
    };
    for (const section of property.sections) {
        switch (section.type) {
            case 'TITLE':
                output.title = section.title;
                break;
            case 'MEDIA':
                output.photos = section.media.filter((m) => m.type === 'PICTURE').map((m) => m.fullImageUrl);
                output.tour3d = section.media.filter((m) => m.type === 'VIRTUAL_TOUR').map((m) => m.url);
                break;
            case 'MAP':
                output.latitude = section?.location?.lat;
                output.longitude = section?.location?.lng;
                output.address = `${section.addressLine1} ${section.addressLine2}`;
                break;
            case 'TEXT_AREA':
                if (section.title === 'Property Description') {
                    output.description = section.text;
                }
                break;
            case 'TOP_ATTRIBUTES':
            case 'ATTRIBUTE_LIST':
                for (const attr of section.attributes) {
                    switch (attr.label) {
                        case 'Bathrooms:':
                            output.baths = attr.text;
                            break;
                        case 'Sleeping rooms:':
                            output.rooms = attr.text;
                            break;
                        case 'Total rent:':
                            if (!output.price) {
                                output.price = attr.text;
                            }
                            break;
                        case 'Rooms':
                            output.rooms = attr.text;
                            break;
                        case 'Apartment type:':
                            output.subTypology = attr.text;
                            break;
                        default:
                            break;
                    }
                    // Fallback for non-apartment types (house/office/garage/...), whose
                    // ATTRIBUTE_LIST labels don't match the literal apartment strings above
                    // (e.g. garages use "Building type:" instead of "Apartment type:").
                    const label = (attr.label ?? '').toLowerCase();
                    if (!output.rooms && /room/.test(label) && !/bath/.test(label)) {
                        output.rooms = attr.text;
                    }
                    if (!output.baths && /bath/.test(label)) {
                        output.baths = attr.text;
                    }
                    if (!output.subTypology && /type:$/.test(label)) {
                        output.subTypology = attr.text;
                    }
                    // TOP_ATTRIBUTES always carries the listing's headline price,
                    // regardless of realEstateType — used as fallback when
                    // adTargetingParameters lacks a type-specific price key (e.g. garages: obj_rent).
                    if (!output.price && attr.highlighted) {
                        output.price = attr.text.replace(/[^\d]/g, '');
                    }
                }
                break;
            default:
                break;
        }
    }

    return output;
};

export const handleProperty = async (context) => {
    const {
        json,
        request: {
            userData: { requestPayload },
        },
    } = context;

    await Dataset.pushData(handleOneProperty(json, inferOperation(json, requestPayload?.operation ?? 'sale')));
};
