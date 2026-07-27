# ImmobilienScout24 Scraper

Scrape property listings from [immobilienscout24.de](https://www.immobilienscout24.de) — Germany's largest real estate portal. Supports sale and rental properties across Germany and Austria.

## Features

- **Search by location** — enter a district or city name to find matching listings
- **Search by URL** — paste any search results page, shape search URL, or individual property URL
- **Shape search** — paste a polygon/drawn-area URL from the website to scrape within a custom boundary
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
| `startUrl`     | Array   | —        | Direct URLs — property detail pages or filtered search result pages (see below) |
| `proxy`        | Object  | ✓        | Proxy configuration. **RESIDENTIAL proxies required.** |

### Property types

`apartment`, `house`, `plot`, `solid-house`, `shorttermaccommodation`, `flatshareroom`, `garage`, `office`, `store`, `industry`, `gastronomy`, `tradesite`, `specialpurpose`, `investment`, `compulsoryauction`

## Searching via Website URLs

The easiest way to apply filters (rooms, size, features, etc.) is to configure your search directly on [immobilienscout24.de](https://www.immobilienscout24.de), then paste the URL into `startUrl`.

The scraper automatically extracts the property type, operation (sale/rent), and all active filters from the URL and forwards them to the API.

**Supported URL types in `startUrl`:**

| URL pattern | What happens |
|-------------|--------------|
| `.../Suche/de/berlin/berlin/wohnung-kaufen?price=300000-600000&numberofrooms=3-` | Full search with all filters applied |
| `.../Suche/de/berlin/berlin/wohnung-kaufen` | Search with no extra filters |
| `.../Suche/shape/wohnung-kaufen?shape=<encoded-polygon>` | Search within a drawn area/polygon |
| `.../expose/157410302` | Single property detail page |

**Example** — paste this URL into `startUrl` to scrape Berlin apartments for sale, 3+ rooms, €300k–€600k:

```
https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-kaufen?price=300000-600000&numberofrooms=3-
```

**Shape search** — draw an area on the website map, copy the resulting URL, and paste it into `startUrl`:

```
https://www.immobilienscout24.de/Suche/shape/wohnung-kaufen?shape=c2FhX0l1anBvQWRdX0M-c2VAdV9AcXVFZ3lBelo
```

The scraper extracts the polygon from the `shape` query parameter and property type/operation from the URL path segment. All extra filter parameters are forwarded automatically. The `operation` and `propertyType` input fields are ignored when the URL already encodes them in the path.

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
    "condition": "mint_condition",
    "availableFrom": "2026-08-01",
    "description": "Moderne 4-Zimmer-Wohnung mit Balkon, Aufzug im Neubau, ...",
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
