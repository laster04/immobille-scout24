# ImmobilienScout24 Scraper — Germany & Austria

Scrape property listings from [immobilienscout24.de](https://www.immobilienscout24.de), Germany's largest real estate portal, including its Austrian listings: apartments, houses, plots, commercial property and foreclosure auctions, for sale or rent. Get price, €/m², size, rooms, energy class, features, full address with GPS, agent name and phone, and photos as JSON, CSV or Excel. **From $0.80 per 1,000 results**, and you pay only for results.

The Actor uses the same API as the ImmoScout24 mobile app, so it is fast and returns structured data, not scraped HTML.

### What you can do

- **Paste any search URL**: every filter you set on the website comes along (rooms, size, energy class, features, keyword, commission-free, and more). Drawn map areas and single listing pages work too.
- **Or search by place**: a city or district name, or a radius around a point, with price, rooms, living space, construction year and must-have feature filters.
- **Get only new listings**: schedule a run with `monitoringMode` and get, and pay for, only listings that weren't there on the last run.
- **Get the whole search**: no 1,000-listing ceiling. Leave the limits empty and every page of the search is scraped.
- **Generate leads**: agency name, contact name, rating and phone numbers on every listing that shows them.

### Why this scraper

- **Each listing is charged once**, even when it shows up in several of your URLs in the same run.
- **No platform costs**: you pay per result. `maxItems` caps the whole run, and the run stops as soon as your maximum charge is used up.
- **65+ fields**, prices as numbers, flags as true/false: ready for a spreadsheet without cleanup.

## Pricing

Pay-per-event: you are not charged for Apify platform usage (compute, proxy traffic), only for results.

| Event       | Free   | Bronze | Silver | Gold+  | When it's charged               |
| ----------- | ------ | ------ | ------ | ------ | ------------------------------- |
| Result      | $1.50  | $1.20  | $1.10  | $0.80  | Per 1,000 listings returned     |
| Actor start | $0.005 | $0.005 | $0.005 | $0.005 | Once per run (per GB of memory) |

Each listing is charged **once** per run. In monitoring mode, listings returned by earlier runs are not returned or charged again. Set `maxItems`, or a maximum charge per run in Apify Console, to cap what a run can cost.

## The easiest way: paste a URL

**Search on immobilienscout24.de the way you normally would, copy the URL out of your browser and paste it into `startUrl`.**

Whatever the URL contains is forwarded to the API, so you don't have to rebuild your search in this Actor's fields.

```
https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-kaufen?price=300000-600000&numberofrooms=3-&equipment=balcony
```

| URL you paste                                                                    | What you get                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------- |
| `.../Suche/de/berlin/berlin/wohnung-kaufen?price=300000-600000&numberofrooms=3-` | The search results, with all filters applied  |
| `.../Suche/de/bayern/muenchen/wohnung-mit-balkon-mieten`                         | SEO and landing-page URLs work too            |
| `.../Suche/shape/wohnung-kaufen?shape=<encoded-polygon>`                         | Everything inside an area you drew on the map |
| `.../expose/157410302`                                                           | One single property                           |

Property type and sale/rent are read from the URL, so the `Operation` and `Property type` fields are ignored when you paste one. Paste as many URLs as you like; they are scraped in one run, and a listing found by two of them is returned once.

## Or build the search in the input form

No URL? Fill in a **Location** (e.g. `Berlin`, `München`, `Wien` with country Austria), or **coordinates + radius** for a radius search around a point, and use the filter fields: price, rooms, living space, construction year, must-have features, pets allowed, exclude new-build projects, and sorting.

## Input

| Field                                         | Type    | Description                                                                                                |
| --------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `startUrl`                                    | Array   | **Recommended.** Search, shape or expose URLs copied from the website                                      |
| `district`                                    | String  | Location keyword, e.g. `Berlin`. Used only when no URL is given                                            |
| `coordinates`                                 | String  | `lat, lng` for a radius search, e.g. `52.52, 13.405`                                                       |
| `radiusKm`                                    | Integer | Radius around those coordinates, in km                                                                     |
| `country`                                     | String  | `de` (Germany) or `at` (Austria)                                                                           |
| `operation`                                   | String  | `sale` or `rent`                                                                                           |
| `propertyType`                                | String  | See the list below (default `apartment`)                                                                   |
| `minPrice` / `maxPrice`                       | Integer | Purchase price, or base rent per month for rentals                                                         |
| `minRooms` / `maxRooms`                       | Integer | Number of rooms                                                                                            |
| `minSize` / `maxSize`                         | Integer | Living space in m²                                                                                         |
| `minConstructionYear` / `maxConstructionYear` | Integer | Construction year range                                                                                    |
| `equipment`                                   | Array   | `balcony`, `builtinkitchen`, `cellar`, `garden`, `lift`, `guesttoilet`, `parking`, `handicappedaccessible` |
| `petsAllowed`                                 | Boolean | Rentals that allow pets                                                                                    |
| `excludeNewBuildProjects`                     | Boolean | Skip developer project listings                                                                            |
| `sortBy`                                      | String  | `default`, `newest`, `priceAsc`, `priceDesc`, `sizeDesc`                                                   |
| `monitoringMode`                              | Boolean | Return only listings earlier runs of the same search did not return (see below)                            |
| `maxItems`                                    | Integer | Stop after this many properties, for the whole run. Empty = everything                                     |
| `endPage`                                     | Integer | Stop each search after this many result pages (20 per page). Empty = every page                            |
| `proxy`                                       | Object  | **RESIDENTIAL proxies required**                                                                           |
| `debugLog`                                    | Boolean | Log every request                                                                                          |

Filters from a pasted URL always win over the fields above.

### Property types

`apartment`, `house`, `plot`, `solid-house`, `shorttermaccommodation`, `flatshareroom`, `garage`, `office`, `store`, `industry`, `gastronomy`, `tradesite`, `specialpurpose`, `investment`, `compulsoryauction`

## Monitoring: new listings only

Set `monitoringMode: true` and schedule the Actor in Apify Console, e.g. daily or every hour. The first run returns the whole search. Every later run with the same search returns only listings that no earlier run returned, so you pay only for new listings.

Monitoring always sorts newest first, and a run stops at the first result page with nothing new on it. Checking a search with 5,000 listings where nothing changed takes one request.

The list of seen listings is kept in your account's `immoscout24-monitoring` key-value store, separately for each search. Changing the URL, location or a filter starts a new list; changing `maxItems`, `endPage` or sorting does not. Single listing URLs (`/expose/...`) are always returned.

## Ready-made examples

Copy an input into the Actor's JSON input tab and run it.

| You want                                    | Key input                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| New rental apartments in Berlin, daily      | `"district": "Berlin", "operation": "rent", "monitoringMode": true`                                                                        |
| New apartments for sale in Munich, daily    | `"startUrl": [{ "url": "https://www.immobilienscout24.de/Suche/de/bayern/muenchen/wohnung-kaufen" }], "monitoringMode": true`              |
| 3+ room rentals in Hamburg with a balcony   | `"startUrl": [{ "url": "https://www.immobilienscout24.de/Suche/de/hamburg/hamburg/wohnung-mieten?numberofrooms=3.0-&equipment=balcony" }]` |
| Houses for sale in Frankfurt under €600,000 | `"district": "Frankfurt am Main", "propertyType": "house", "maxPrice": 600000`                                                             |
| Apartments for sale in Vienna, newest first | `"country": "at", "district": "Wien", "sortBy": "newest"`                                                                                  |
| Building plots within 20 km of Cologne      | `"coordinates": "50.9375, 6.9603", "radiusKm": 20, "propertyType": "plot"`                                                                 |
| Pet-friendly rentals in Berlin              | `"district": "Berlin", "operation": "rent", "petsAllowed": true`                                                                           |
| Foreclosure auctions in Berlin              | `"district": "Berlin", "propertyType": "compulsoryauction"`                                                                                |
| Investment properties in Leipzig            | `"district": "Leipzig", "propertyType": "investment"`                                                                                      |

A full input, for example the daily Berlin rental alerts:

```json
{
    "district": "Berlin",
    "operation": "rent",
    "propertyType": "apartment",
    "monitoringMode": true,
    "maxItems": 300,
    "proxy": { "useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"] }
}
```

## Shape (map area) search

Draw an area on the website map, copy the URL, paste it in:

```
https://www.immobilienscout24.de/Suche/shape/wohnung-mieten?shape=e3NvX0lrd3NwQXtoQWVVbEVzfUF8aEFxRWBVc31B
```

The polygon is decoded from the `shape` parameter and sent to the API as-is, so the scraped area is exactly the one you drew.

## Output

65+ fields per property: price broken down into its components, size, rooms, building details, energy certificate, features, full address with coordinates, agent contact and photos:

```json
{
    "url": "https://www.immobilienscout24.de/expose/157410302",
    "id": "157410302",
    "scoutId": "157410302",
    "objectNumber": "BBS 18-19 - WE 29",
    "operation": "sale",
    "price": 674000,
    "purchasePrice": 674000,
    "hasCommission": false,
    "typology": "apartment",
    "propertyType": "wohnung_kauf",
    "realEstateType": "apartmentbuy",
    "size": 100.53,
    "rooms": 4,
    "floor": 2,
    "numberOfFloors": 4,
    "condition": "first_time_use",
    "interiorQuality": "sophisticated",
    "newlyConstructed": false,
    "rented": false,
    "heatingType": "floor_heating",
    "firingTypes": "electricity",
    "energyEfficiencyClass": "A_PLUS",
    "energyCertificateType": "energy_required",
    "thermalCharacteristic": 12,
    "balcony": true,
    "garden": false,
    "cellar": true,
    "lift": true,
    "fittedKitchen": false,
    "barrierFree": true,
    "assistedLiving": false,
    "street": "Berkenbrücker Steig",
    "houseNumber": "18-19",
    "zipCode": "13055",
    "city": "Berlin",
    "state": "Berlin",
    "district": "Lichtenberg Bezirk",
    "quarter": "Alt Hohenschönhausen",
    "country": "deutschland",
    "isPrivateListing": false,
    "photosCount": 14,
    "contacts": {
        "commercialName": "WvM Vertriebsgesellschaft mbH",
        "contactName": "Wir freuen uns auf Sie. Ihr Team der WvM Vertriebsgesellschaft mbH",
        "rating": "(4.4 stars)",
        "ratingValue": 4.4,
        "logo": "https://pictures.immobilienscout24.de/usercontent/e51ea80d-b035-4b66-b948-0154994f5c5c.JPG/ORIG/resize/%WIDTH%x%HEIGHT%%3E/format/webp/quality/80",
        "phones": ["+49 30 58619900"]
    },
    "photos": [
        "https://pictures.immobilienscout24.de/listings/f5781530-179c-4a80-a809-ef2a9ff2a717-2073330392.png/ORIG/resize/1500x1000/format/webp/quality/80"
    ],
    "tour3d": [],
    "title": "Moderne 4-Zimmer-Wohnung mit Balkon, Aufzug im Neubau!",
    "latitude": 52.5373,
    "longitude": 13.48036,
    "address": "Berkenbrücker Steig 18-19 13055 Alt-Hohenschönhausen, Berlin",
    "subTypology": "Flat",
    "bedrooms": 3,
    "baths": 2,
    "availableFrom": "28.02.2027",
    "description": "In diesem Neubauprojekt entstehen bis Ende des Jahres 44 hoc ...",
    "furnishing": "Auf 100,53 m² erwartet Sie eine moderne 4-Zimmer-Wohnung in  ...",
    "locationDescription": "Das ideale Wohngebiet In diesem charmanten Berliner Stadttei ...",
    "otherNotes": "ENERGIEPFLICHTANGABEN GEM. § 87 GEG: Art des Energieausweise ...",
    "pricePerSqm": 6704.47
}
```

Every field is also declared in the dataset schema, so the Apify UI, CSV and Excel exports show them as proper columns.

- Prices are numbers, not strings. `price` is the purchase price for sale listings and the base rent for rentals; `baseRent`, `serviceCharge`, `totalRent` and `purchasePrice` are filled in whenever the listing has them. Foreclosure auctions have no asking price: `price` and `marketValue` hold the court's market value.
- Some listings hide their exact address. Those return the map center point the listing itself provides.

## FAQ

### How do I get only new listings every day?

Set `monitoringMode: true` and schedule the Actor in Apify Console. Each run returns only listings that earlier runs with the same search did not return. See [Monitoring](#monitoring-new-listings-only).

### Can I get more than 1,000 results from one search?

Yes. Leave `maxItems` and `endPage` empty and every page of the search is scraped. The API serves searches with tens of thousands of listings to the end.

### How much does a run cost?

$0.80 to $1.50 per 1,000 listings depending on your Apify plan, plus $0.005 per run (see [Pricing](#pricing)). Example: 2,000 Berlin rentals cost $1.60 to $3.00. Set `maxItems` to cap a run.

### Does it return agent phone numbers?

Yes, when the listing shows one: `contacts.phones`, next to the agency's `commercialName`, the `contactName` and the agency rating. Private landlords often hide their number.

### Does it work for Austria?

Yes. Set `country` to `at` and a location such as `Wien`, `Graz` or `Salzburg`, or paste an immobilienscout24.de URL for an Austrian search.

### Why are developer projects missing?

Search results also contain "project" cards for new-build developments, which group several units. The Actor returns individual listings only; use `excludeNewBuildProjects` to drop project units from the search as well.

### Can I use it from my code or another tool?

Yes. Run it through the [Apify API](https://docs.apify.com/api/v2) or the JavaScript and Python clients, or connect it to Make, Zapier, n8n, Google Sheets, Slack and other tools via Apify integrations. Results download as JSON, CSV, Excel or XML.

### Why do I need residential proxies?

ImmoScout24 blocks datacenter IPs. The input defaults to Apify's `RESIDENTIAL` proxy group, and its cost is included in the per-result price.

### Is scraping ImmoScout24 legal?

The Actor collects only data that ImmoScout24 shows publicly. Listings can include personal data such as names and phone numbers; under the GDPR you need a legitimate reason to store and use it. If you are unsure, ask a lawyer.

## Changelog

New features and fixes are listed in the [changelog](https://github.com/laster04/immobille-scout24/blob/main/CHANGELOG.md).
