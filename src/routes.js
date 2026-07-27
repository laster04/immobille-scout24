import { log, Dataset } from '@crawlee/cheerio';
import { LABELS, BASIC_HEADERS, LISTING_BODY } from './consts.js';
import { getSearchUrl, getShapeSearchUrl } from './ListingSearchHelper.js';

export const handleDistrictSearch = async (context) => {
    const { json, crawler: { requestQueue }, request: { userData } } = context;
    const { userInput } = userData;
    log.info(`Found ${json.results.length}`);
    const foundLocation = json.results[0];
    log.info('Pick:', { data: json.results[0] })

    const url = getSearchUrl({
        geocodes: foundLocation.geopath,
        realestateType: userInput.propertyType,
        operation: userInput.operation,
        pageNumber: 1,
        min: userInput.minPrice,
        max: userInput.maxPrice
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
                maxItems: 20,
                ...userInput,
            },
        },
    });
}

export const handlePropertyList = async (context, { userInput }) => {
    const { json, crawler: { requestQueue }, request: { userData } } = context;
    const { maxItems, endPage = 10 } = userInput;
    const { requestPayload : body } = userData;

    let items = (body.pageNumber - 1) * json.pageSize;
    let processedItems = items;
    for (const article of json.resultListItems) {
        if (processedItems >= maxItems) {
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
        processedItems++;
    }
    items = processedItems;
    let page = body.pageNumber;
    if (page === 1) {
        log.info(`Total pageItems ${json.totalResults}`);
    }
    if (items < json.totalResults && page <= endPage && page <= json.numberOfPages) {
        if (maxItems !== null && items > maxItems) {
        } else {
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
    }
};

export const handleProperty = async (context) => {
    const { json, request: { userData: { requestPayload } } } = context;

    await Dataset.pushData(handleOneProperty(json, requestPayload?.operation ?? 'sale'));
};


const handleOneProperty = (property, operation) => {
    const { adTargetingParameters, contact } = property;
    const output = {
        url: `https://www.immobilienscout24.de/expose/${property.header.id}`,
        id: property.header.id,
        operation: operation,
        typology: adTargetingParameters.obj_typeOfFlat,
        price: operation === 'rent'
            ? (adTargetingParameters.obj_baseRent ?? adTargetingParameters.obj_rent)
            : adTargetingParameters?.obj_purchasePrice,
        size: adTargetingParameters.obj_livingSpace,
        condition: adTargetingParameters.obj_condition,
        availableFrom: adTargetingParameters.obj_availableFrom,
        contacts: {
            commercialName: contact.contactData.agent.company,
            contactName: contact.contactData.agent.name,
            rating: contact.contactData.agent.rating.label,
            phones: contact.phoneNumbers.map((c) => c.text)
        }
    }
    for (const section of property.sections) {
        switch (section.type) {
            case 'TITLE':
                output.title = section.title;
                break;
            case 'MEDIA':
                output.photos = section.media.filter(m => m.type === 'PICTURE').map(m => m.fullImageUrl);
                output.tour3d = section.media.filter(m => m.type === 'VIRTUAL_TOUR').map(m => m.url);
                break;
            case 'MAP':
                output.latitude = section?.location?.lat;
                output.longitude = section?.location?.lng;
                output.address = section.addressLine1 + ' ' + section.addressLine2
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
                            output.baths = attr.text
                            break;
                        case 'Sleeping rooms:':
                            output.rooms = attr.text
                            break;
                        case 'Total rent:':
                            if (!output.price) {
                                output.price = attr.text
                            }
                            break;
                        case 'Rooms':
                            output.rooms = attr.text
                            break;
                        case 'Apartment type:':
                            output.subTypology = attr.text
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
        }
    }

    return output;
}
