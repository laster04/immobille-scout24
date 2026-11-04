# Changelog

## [Unreleased]

### New features

- **Monitoring mode** (`monitoringMode`). Returns only listings that earlier runs of the same search did not return, so scheduled runs bill only for new listings. It sorts newest first and stops at the first page with nothing new, so a check where nothing changed costs one request.
- `marketValue` output field: the court's market value of a foreclosure auction. Auctions also use it as their `price`.

### Fixes

- Foreclosure auction searches (`compulsoryauction`) returned nothing: every search sent an empty price filter, which ImmoScout24 rejects for auctions.
- Searches stopped after 50 pages (1,000 listings) when `endPage` was left empty. They now run to the last page.
- Two pasted URLs for the same place and property type but with different filters ran only the first one.
- A run stops as soon as your maximum charge is reached, instead of loading pages whose results can't be returned.
- A run that Apify moves to another server mid-way keeps its item count and doesn't return listings twice.

## 2026-09-04

### New features

- Paste any immobilienscout24.de search, map-area or listing URL; every filter in it is applied.
- Search by location, or by radius around coordinates, with price, rooms, living space, construction year, features, pets and sorting filters.
- 65+ output fields with numbers and booleans, all shown as columns in the Apify UI, CSV and Excel.
- `maxItems` caps the whole run instead of each URL.
