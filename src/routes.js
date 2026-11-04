import { log } from '@crawlee/cheerio';

import { BASIC_HEADERS, LABELS, LISTING_BODY } from './consts.js';
import { getRadiusSearchUrl, getSearchUrl, getShapeSearchUrl, searchUniqueKey } from './ListingSearchHelper.js';
import { claimListing, isMonitoring, pushListing, runIsFull } from './state.js';

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

const hasNextPage = ({ page, json, endPage, claims }) => {
    if (runIsFull()) return false;
    if (page >= json.numberOfPages || (endPage != null && page >= endPage)) return false;
    // Monitoring sorts newest first, so a page with nothing new means every later page is old too.
    if (isMonitoring() && claims.ok === 0 && claims.known > 0) {
        log.info(`Page ${page} has only listings seen in earlier runs - the rest of this search is not new.`);
        return false;
    }
    return true;
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
    const { endPage } = userInput;
    const { requestPayload: body } = userData;
    const page = body.pageNumber;
    if (page === 1) {
        log.info(`Search has ${json.totalResults} listings on ${json.numberOfPages} pages.`, {
            url: context.request.url,
        });
    }

    // Every listing is claimed run-wide: that dedupes overlapping searches, caps the whole run at
    // `maxItems`, stops at the user's max charge and (monitoring) skips listings returned before.
    const claims = { ok: 0, duplicate: 0, known: 0, limit: 0, budget: 0 };
    const details = [];
    for (const article of json.resultListItems) {
        if (article.type !== 'EXPOSE_RESULT') continue;
        const claim = claimListing(article.item.id);
        claims[claim]++;
        if (claim !== 'ok') continue;

        details.push({
            url: `https://api.mobile.immobilienscout24.de/expose/${article.item.id}`,
            method: 'GET',
            headers: BASIC_HEADERS,
            userData: {
                ...userData,
                label: LABELS.PROPERTY,
                exposeId: article.item.id,
                // Only the result list knows these — the expose endpoint doesn't return them
                listItem: {
                    published: article.item.published,
                    isNewListing: article.item.isNewObject,
                    isPrivateListing: article.item.isPrivate,
                    listingType: article.item.listingType,
                },
            },
        });
    }
    log.debug(`Page ${page}: ${JSON.stringify(claims)}`);

    // The next page goes to the front of the queue, ahead of this page's detail requests: pages are
    // read one after another, and behind 20 details each the queue ran dry on the platform
    // (concurrency fell to 3 of 10, ~2 listings/s, Nov 2026).
    if (hasNextPage({ page, json, endPage, claims })) {
        const nextBody = { ...body, pageNumber: page + 1 };
        await requestQueue.addRequest(
            {
                url: nextPageUrl(nextBody),
                uniqueKey: searchUniqueKey(nextBody),
                // Every search type is a POST with the same body — a GET answers {"error":"what???"}
                method: 'POST',
                payload: JSON.stringify(LISTING_BODY),
                headers: BASIC_HEADERS,
                userData: {
                    ...userData,
                    label: LABELS.PROPERTY_LIST,
                    requestPayload: nextBody,
                },
            },
            { forefront: true },
        );
    }
    if (details.length > 0) await requestQueue.addRequests(details);
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
        // Compulsory auctions have no purchase price, only the court's market value
        price:
            operation === 'rent'
                ? toNumber(ad.obj_baseRent ?? ad.obj_rent)
                : toNumber(ad.obj_purchasePrice ?? ad.obj_marketValue),
        purchasePrice: toNumber(ad.obj_purchasePrice),
        baseRent: toNumber(ad.obj_baseRent ?? ad.obj_rent),
        serviceCharge: toNumber(ad.obj_serviceCharge),
        totalRent: toNumber(ad.obj_totalRent),
        hasCommission: toBool(ad.obj_courtage),
        marketValue: toNumber(ad.obj_marketValue),

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
        crawler,
        request: {
            userData: { requestPayload, listItem, exposeId },
        },
    } = context;

    // Pasted expose URLs never went through a search, so they are claimed here - and returned even
    // when a monitoring run has seen them before, since the user asked for exactly that listing.
    if (exposeId == null) {
        const claim = claimListing(json?.header?.id, { ignoreKnown: true });
        if (claim !== 'ok') {
            log.info(`Skipping expose ${json?.header?.id}: ${claim}`);
            return;
        }
    }

    await pushListing(
        crawler,
        handleOneProperty(json, inferOperation(json, requestPayload?.operation ?? 'sale'), listItem ?? {}),
    );
};
