export const LABELS = {
    DISTRICT_SEARCH: 'DISTRICT_SEARCH',
    PROPERTY_LIST: 'PROPERTY_LIST',
    PROPERTY: 'PROPERTY',
};

// Result page size hardcoded in the search URLs below
export const PAGE_SIZE = 20;
// Used when `endPage` is missing or null on the input (console prefills 50)
export const DEFAULT_END_PAGE = 50;

export const LISTING_BODY = {
    supportedResultListTypes: [
        'LIST_FIRST_LISTING_BANNER',
        'SURROUNDINGS',
        'REALTOR_TOUCHPOINT',
        'PROPERTY_VALUATION_BANNER',
        'WAITING_LIST_BANNER',
        'ADVERTISEMENT',
    ],
};

export const BASIC_HEADERS = {
    accept: 'application/json',
    // Without this the API answers in German and every English label match in
    // `handleOneProperty` silently misses (the response language follows the caller's IP otherwise).
    'accept-language': 'en-US,en;q=0.9',
    'x-is24-device': 'iphone',
    'user-agent': 'ImmoScout_27.11_26.1_._',
    priority: 'u=3',
};

// input `sortBy` value -> API `sorting` value ('-' prefix is descending)
export const SORTING_MAP = {
    default: 'standard',
    newest: '-firstactivation',
    priceAsc: 'price',
    priceDesc: '-price',
    sizeDesc: '-livingspace',
};
