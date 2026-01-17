

const BASE_SEARCH_URL = 'https://api.mobile.immobilienscout24.de/search/list?features=adKeysAndStringValues,virtualTour,contactDetails,additionalImages,viareporting,nextgen,calculatedTotalRent,listingsInListFirstSummary,xxlListingType,quickfilters,grouping,projectsInAllRealestateTypes,fairPrice&pagesize=20&searchType=region&sorting=standard&channel=is24';
const OPERATION_SALE = 'sale';

function getSearchUrl( inputQuery ) {
    const { geocodes, realestateType, operation, pageNumber = 1, min = null, max = null } = inputQuery;
    const realEstateQuery = getRealEstateTypeOperation(realestateType, operation);
    const priceQuery = getPriceFilter(min, max);
    return BASE_SEARCH_URL + `&geocodes=${geocodes}` +`&pagenumber=${pageNumber}` + `&${realEstateQuery}` + `&${priceQuery}`;
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

export {
    getSearchUrl,
}
