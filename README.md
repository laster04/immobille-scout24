# ImmobilienScout24 Scraper

Scrape property listings from [immobilienscout24.de](https://www.immobilienscout24.de) — Germany's largest real estate portal — for Germany and Austria, sale and rent, all property types.

## The easiest way: paste a URL

**Search on immobilienscout24.de the way you normally would, copy the URL out of your browser, paste it into `startUrl`. Done.**

Every filter you clicked on the website comes along: rooms, living space, construction year, energy class, features, commission-free, keyword search — whatever the URL contains is forwarded to the API. You do not have to reproduce your search in this Actor's fields.

```
https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-kaufen?price=300000-600000&numberofrooms=3-&equipment=balcony
```

| URL you paste                                                                    | What you get                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------- |
| `.../Suche/de/berlin/berlin/wohnung-kaufen?price=300000-600000&numberofrooms=3-` | The search results, with all filters applied  |
| `.../Suche/de/bayern/muenchen/wohnung-mit-balkon-mieten`                         | Works with SEO/landing-page URLs too          |
| `.../Suche/shape/wohnung-kaufen?shape=<encoded-polygon>`                         | Everything inside an area you drew on the map |
| `.../expose/157410302`                                                           | One single property                           |

Property type and sale/rent are read from the URL, so the `Operation` and `Property type` fields are ignored when you paste one. Paste as many URLs as you like — they are scraped in one run.

## Or build the search in the input form

No URL? Fill in a **Location** (e.g. `Berlin`, `München`) — or **coordinates + radius** for a radius search around a point — and use the filter fields: price, rooms, living space, construction year, must-have features, pets allowed, exclude new-build projects, and sorting (including **newest first**, which is what you want for monitoring a market).

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
| `maxItems`                                    | Integer | Stop after this many properties                                                                            |
| `endPage`                                     | Integer | Stop after this many result pages (20 per page, default 50)                                                |
| `proxy`                                       | Object  | **RESIDENTIAL proxies required**                                                                           |
| `debugLog`                                    | Boolean | Log every request                                                                                          |

Filters from a pasted URL always win over the fields above.

### Property types

`apartment`, `house`, `plot`, `solid-house`, `shorttermaccommodation`, `flatshareroom`, `garage`, `office`, `store`, `industry`, `gastronomy`, `tradesite`, `specialpurpose`, `investment`, `compulsoryauction`

## Shape (map area) search

Draw an area on the website map, copy the URL, paste it in:

```
https://www.immobilienscout24.de/Suche/shape/wohnung-mieten?shape=e3NvX0lrd3NwQXtoQWVVbEVzfUF8aEFxRWBVc31B
```

The polygon is decoded from the `shape` parameter and sent to the API as-is, so the scraped area is exactly the one you drew.

## Output

65+ fields per property — price broken down into its components, size, rooms, building details, energy certificate, features, full address with coordinates, agent contact and photos:

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

> Some listings hide their exact address. Those return the map center point the listing itself provides, and `address` says so.

## Notes

- **RESIDENTIAL proxies are required.** Datacenter proxies are blocked by the site. Use [Apify Proxy](https://docs.apify.com/platform/proxy) with the `RESIDENTIAL` group.
- Prices are numbers, not strings: `price` is the purchase price for sale listings and the base rent for rentals; `baseRent`, `serviceCharge`, `totalRent` and `purchasePrice` are filled in whenever the listing has them.
- `sortBy: newest` plus a small `maxItems` is the cheapest way to poll a market for fresh listings on a schedule.
