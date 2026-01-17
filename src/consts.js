export const LABELS = {
    DISTRICT_SEARCH: 'DISTRICT_SEARCH',
    PROPERTY_LIST: 'PROPERTY_LIST',
    PROPERTY: 'PROPERTY'
};
export const MAX_ITEMS_STAT_NAME = 'MAX_ITEMS_STAT';

export const SEARCH_LIST_URL = ( geocodes, page = 1, realestatetype = 'apartmentrent') => `https://api.mobile.immobilienscout24.de/search/list?features=adKeysAndStringValues,virtualTour,contactDetails,additionalImages,viareporting,nextgen,calculatedTotalRent,listingsInListFirstSummary,xxlListingType,quickfilters,grouping,projectsInAllRealestateTypes,fairPrice&priceType=calculatedtotalrent&pagesize=20&searchType=region&pagenumber=${page}&geocodes=${geocodes}&sorting=standard&realestatetype=${realestatetype}&price=-&channel=is24`

export const LISTING_BODY = {
    supportedResultListTypes:["LIST_FIRST_LISTING_BANNER","SURROUNDINGS","REALTOR_TOUCHPOINT","PROPERTY_VALUATION_BANNER","WAITING_LIST_BANNER","ADVERTISEMENT"]
}

export const BASIC_HEADERS = {
    'accept':'application/json',
    'x-is24-device':'iphone',
    'user-agent':'ImmoScout_27.11_26.1_._',
    'priority':'u=3'
};
