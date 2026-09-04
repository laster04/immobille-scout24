import { Dataset, log } from '@crawlee/cheerio';

import { BASIC_HEADERS, DEFAULT_END_PAGE, LABELS, LISTING_BODY } from './consts.js';
import { getRadiusSearchUrl, getSearchUrl, getShapeSearchUrl, searchUniqueKey } from './ListingSearchHelper.js';

/** Rebuilds the search URL for the next page of whichever search type this request came from. */
const nextPageUrl = (body) => {
    const common = {
        realestateType: body.propertyType,
        operation: body.operation,
        pageNumber: body.pageNumber,
        min: body.minPrice,
        max: body.maxPrice,
        filters: body.filters ?? {},
        extraParams: body.extraParams ?? {},
    };
    if (body.shape) return getShapeSearchUrl({ ...common, shape: body.shape });
    if (body.geocoordinates) return getRadiusSearchUrl({ ...common, ...body.geocoordinates });
    return getSearchUrl({ ...common, geocodes: body.geopath });
};

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

    const requestPayload = {
        geopath: foundLocation.geopath,
        pageNumber: 1,
        enqueuedItems: 0,
        ...userInput,
    };

    await requestQueue.addRequest({
        url: getSearchUrl({
            geocodes: foundLocation.geopath,
            realestateType: userInput.propertyType,
            operation: userInput.operation,
            pageNumber: 1,
            min: userInput.minPrice,
            max: userInput.maxPrice,
            filters: userInput.filters ?? {},
        }),
        method: 'POST',
        uniqueKey: searchUniqueKey(requestPayload),
        payload: JSON.stringify(LISTING_BODY),
        headers: BASIC_HEADERS,
        userData: {
            ...userData,
            label: LABELS.PROPERTY_LIST,
            requestPayload,
        },
    });
};

export const handlePropertyList = async (context, { userInput, counter }) => {
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

    // Count the properties actually enqueued instead of assuming every page was full.
    // The counter is shared by every search in the run, so `maxItems` caps the whole dataset
    // and not each start URL separately.
    for (const article of json.resultListItems) {
        if (counter.count >= maxItems) {
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
                // Only the result list knows these — the expose endpoint doesn't return them
                listItem: {
                    published: article.item.published,
                    isNewListing: article.item.isNewObject,
                    isPrivateListing: article.item.isPrivate,
                    listingType: article.item.listingType,
                },
            },
        });
        counter.increment();
    }

    const page = body.pageNumber;
    if (page === 1) {
        log.info(`Total pageItems ${json.totalResults}`);
    }

    const hasMorePages = page < endPage && page < json.numberOfPages;
    if (counter.count < maxItems && hasMorePages) {
        body.pageNumber = page + 1;

        await requestQueue.addRequest({
            url: nextPageUrl(body),
            uniqueKey: searchUniqueKey(body),
            // Every search type is a POST with the same body — a GET answers {"error":"what???"}
            method: 'POST',
            payload: JSON.stringify(LISTING_BODY),
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

// Every adTargetingParameters value is a string; flags are 'y' / 'n' / 'no_information'
const BOOL_VALUES = { y: true, n: false, yes: true, no: false, true: true, false: false };
const toBool = (value) => (typeof value === 'string' ? BOOL_VALUES[value.toLowerCase()] : undefined);
const toNumber = (value) => {
    if (value == null || value === '') return undefined;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
};
// Geo and street values come underscored ('Mitte_Bezirk', 'Berkenbrücker_Steig')
const unslug = (value) => (typeof value === 'string' ? value.replace(/_/g, ' ') : undefined);
// Price texts are localized ('674.000 €', '6.704 €/m²') — keep digits only
const priceTextToNumber = (text) => toNumber(String(text ?? '').replace(/[^\d]/g, ''));

const handleOneProperty = (property, operation, listItem = {}) => {
    const { adTargetingParameters: ad, contact } = property;
    const agent = contact?.contactData?.agent ?? {};

    const output = {
        url: `https://www.immobilienscout24.de/expose/${property.header.id}`,
        id: property.header.id,
        scoutId: ad.obj_scoutId,
        objectNumber: ad.obj_objectnumber,
        operation,
        // Price stays the headline number for the operation; the components below are always filled in too
        price: operation === 'rent' ? toNumber(ad.obj_baseRent ?? ad.obj_rent) : toNumber(ad.obj_purchasePrice),
        purchasePrice: toNumber(ad.obj_purchasePrice),
        baseRent: toNumber(ad.obj_baseRent ?? ad.obj_rent),
        serviceCharge: toNumber(ad.obj_serviceCharge),
        totalRent: toNumber(ad.obj_totalRent),
        hasCommission: toBool(ad.obj_courtage),

        // Houses use obj_buildingType where apartments use obj_typeOfFlat
        typology: ad.obj_typeOfFlat ?? ad.obj_buildingType,
        propertyType: ad.obj_immotype,
        realEstateType: contact?.contactData?.realEstateType,
        size: toNumber(ad.obj_livingSpace),
        plotArea: toNumber(ad.obj_lotArea ?? ad.obj_plotArea),
        rooms: toNumber(ad.obj_noRooms),
        floor: toNumber(ad.obj_floor),
        numberOfFloors: toNumber(ad.obj_numberOfFloors),
        yearConstructed: toNumber(ad.obj_yearConstructed),
        condition: ad.obj_condition,
        interiorQuality: ad.obj_interiorQual,
        newlyConstructed: toBool(ad.obj_newlyConst),
        rented: toBool(ad.obj_rented),

        heatingType: ad.obj_heatingType,
        firingTypes: ad.obj_firingTypes,
        energyEfficiencyClass: ad.obj_energyEfficiencyClass,
        energyCertificateType: ad.obj_energyType,
        thermalCharacteristic: toNumber(ad.obj_thermalChar),

        balcony: toBool(ad.obj_balcony),
        garden: toBool(ad.obj_garden),
        cellar: toBool(ad.obj_cellar),
        lift: toBool(ad.obj_lift),
        fittedKitchen: toBool(ad.obj_hasKitchen),
        barrierFree: toBool(ad.obj_barrierFree),
        assistedLiving: toBool(ad.obj_assistedLiving),
        petsAllowed: toBool(ad.obj_petsAllowed),
        parkingSpaces: toNumber(ad.obj_noParkSpaces),

        street: unslug(ad.obj_streetPlain),
        houseNumber: ad.obj_houseNumber,
        zipCode: ad.obj_zipCode,
        city: unslug(ad.obj_regio2),
        state: unslug(ad.obj_regio1),
        district: unslug(ad.obj_regio3),
        quarter: unslug(ad.obj_regio4),
        country: unslug(ad.geo_land),

        published: listItem.published,
        isNewListing: listItem.isNewListing,
        isPrivateListing: listItem.isPrivateListing ?? toBool(ad.obj_privateOffer),
        listingType: listItem.listingType,
        photosCount: toNumber(ad.obj_picturecount),

        contacts: {
            commercialName: agent.company,
            contactName: agent.name,
            rating: agent.rating?.label,
            ratingValue: agent.rating?.value,
            logo: agent.logo,
            phones: contact?.phoneNumbers?.map((c) => c.text) ?? [],
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
                // Titles are English because BASIC_HEADERS asks for an English response
                if (section.title === 'Property Description') output.description = section.text;
                if (section.title === 'Furnishing') output.furnishing = section.text;
                if (section.title === 'Location') output.locationDescription = section.text;
                if (section.title === 'Further notes') output.otherNotes = section.text;
                break;
            case 'TOP_ATTRIBUTES':
            case 'ATTRIBUTE_LIST':
                for (const attr of section.attributes) {
                    const label = (attr.label ?? '').toLowerCase();
                    // Only these have no adTargetingParameters key of their own
                    if (label.startsWith('bathrooms')) output.baths = toNumber(attr.text);
                    if (label.startsWith('sleeping rooms')) output.bedrooms = toNumber(attr.text);
                    if (/^(vacant|available)/.test(label)) output.availableFrom = attr.text;
                    // 'Apartment type:', 'Building type:', 'House type:' — but not
                    // 'Energy identification type:' / 'Type of heating:' from the energy block
                    if (!output.subTypology && /type:$/.test(label) && !/energy|heating|certificate/.test(label)) {
                        output.subTypology = attr.text;
                    }
                    // TOP_ATTRIBUTES always carries the listing's headline price, whatever the
                    // realEstateType — the fallback for types without a price key (e.g. garages)
                    if (!output.price && attr.highlighted) output.price = priceTextToNumber(attr.text);
                }
                break;
            default:
                break;
        }
    }

    output.pricePerSqm = output.price && output.size ? Math.round((output.price / output.size) * 100) / 100 : undefined;

    return output;
};

export const handleProperty = async (context) => {
    const {
        json,
        request: {
            userData: { requestPayload, listItem },
        },
    } = context;

    await Dataset.pushData(
        handleOneProperty(json, inferOperation(json, requestPayload?.operation ?? 'sale'), listItem ?? {}),
    );
};
