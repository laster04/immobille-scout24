# ImmobilienScout24 Scraper

Scrape property listings from [immobilienscout24.de](https://www.immobilienscout24.de) — Germany's largest real estate portal. Supports sale and rental properties across Germany and Austria.

## Features

- **Search by location** — enter a district or city name to find matching listings
- **Search by URL** — paste any search results page or individual property URL
- **Sale & rental** — target for-sale or rent listings across all property types
- **Price filtering** — set min/max price range
- **Rich output** — price, size, rooms, bathrooms, photos, 3D tours, coordinates, agent contact

> Note: Some properties hide their exact address. In those cases the scraper returns the map center point provided by the listing.

## Input Parameters

| Field          | Type    | Required | Description |
|----------------|---------|----------|-------------|
| `district`     | String  | —        | Location keyword (e.g. `Berlin`, `München`). Required if no `startUrl`. |
| `country`      | String  | ✓        | `de` (Germany) or `at` (Austria) |
| `operation`    | String  | ✓        | `sale` or `rent` |
| `propertyType` | String  | —        | Property type (default: `apartment`). See values below. |
| `minPrice`     | Integer | —        | Minimum price filter |
| `maxPrice`     | Integer | —        | Maximum price filter |
| `maxItems`     | Integer | —        | Cap on total results returned |
| `endPage`      | Integer | —        | Last page to scrape (default: 50) |
| `startUrl`     | Array   | —        | Direct URLs — property detail pages or search result pages |
| `proxy`        | Object  | ✓        | Proxy configuration. **RESIDENTIAL proxies required.** |

### Property types

`apartment`, `house`, `plot`, `solid-house`, `shorttermaccommodation`, `flatshareroom`, `garage`, `office`, `store`, `industry`, `gastronomy`, `tradesite`, `specialpurpose`, `investment`, `compulsoryauction`

## Example Output

```json
{
    "url": "https://www.immobilienscout24.de/expose/157410302",
    "id": "157410302",
    "operation": "sale",
    "typology": "apartment",
    "subTypology": "Flat",
    "title": "Moderne 4-Zimmer-Wohnung mit Balkon, Aufzug im Neubau!",
    "price": "714000",
    "size": "100.53",
    "rooms": "3",
    "baths": "2",
    "address": "Berkenbrücker Steig 18-19 13055 Alt-Hohenschönhausen, Berlin",
    "latitude": 52.53749,
    "longitude": 13.47987,
    "photos": [
        "https://pictures.immobilienscout24.de/listings/fedae27f-7793-4f42-bae3-ad9ea435c760-1968121293.jpg/ORIG/resize/1500x1000/format/webp/quality/80"
    ],
    "tour3d": [],
    "contacts": {
        "commercialName": "WvM Vertriebsgesellschaft mbH",
        "contactName": "Wir freuen uns auf Sie. Ihr Team der WvM Vertriebsgesellschaft mbH",
        "rating": "(4.3 stars)",
        "phones": []
    }
}
```

## Proxy Requirements

This scraper requires **RESIDENTIAL** proxies. Datacenter proxies are blocked by the site. You can use [Apify Proxy](https://docs.apify.com/platform/proxy) with the `RESIDENTIAL` group.
