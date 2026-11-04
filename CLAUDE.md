# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start          # Run actor locally (node src/main.js)
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier write
npm run format:check   # Prettier check

apify run              # Run actor locally via Apify CLI
apify push             # Deploy to Apify platform (ask first)
APIFY_TOKEN=… node tasks/create-tasks.mjs [--dry-run] [--only=name1,name2]   # create/update example + test-* tasks
APIFY_TOKEN=… node tasks/download-runs.mjs [task …]   # latest run of each task → tasks/runs/<task>/ (gitignored)
```

On the platform the actor is **`lukass/immobilien-scout24`** (id `WtAZc6Kf7Ol5sL1Pj`, version `0.0`), not the `immobille-scout24` in `actor.json` — check what `apify push` targets before pushing. User-facing changes go under `[Unreleased]` in `CHANGELOG.md`.

No tests exist (`npm test` exits 1 by design). `npm run lint` is clean and `src/` is Prettier-clean — keep it that way, but don't run `npm run format` across the repo as a side task (it rewrites `package.json`, `package-lock.json` and the `.actor/` schemas and buries the real diff). Prettier: 4 spaces, single quotes, printWidth 120.

**Local runs hit the real API without a proxy** (the mobile API answers plain requests from a normal IP), which makes end-to-end testing cheap:

```bash
T=/tmp/is24-test; rm -rf $T; mkdir -p $T/key_value_stores/default
echo '{ "startUrl": [{"url":"https://www.immobilienscout24.de/expose/157410302"}], "maxItems": 2 }' > $T/key_value_stores/default/INPUT.json
CRAWLEE_STORAGE_DIR=$T node src/main.js          # items land in $T/datasets/default
```

## Architecture

Apify Actor scraping immobilienscout24.de via the mobile API (`api.mobile.immobilienscout24.de`). Uses `CheerioCrawler` + `@crawlee/cheerio` (HTTP, not browser). ESM (`"type": "module"`), Node >= 18.

Every response is JSON, not HTML — handlers read `context.json` (Crawlee parses JSON bodies for CheerioCrawler); `$` is never used. Cheerio is effectively just the HTTP client here.

### Request flow

```
main.js
  ├─ startUrl .../expose/*        → PROPERTY request directly
  ├─ startUrl .../Suche/shape/*   → parseShapeUrl     → PROPERTY_LIST (polygon search)
  ├─ startUrl .../Suche/*         → parseWebSearchUrl → PROPERTY_LIST (region search, geopath from URL)
  ├─ coordinates + radiusKm       → PROPERTY_LIST (radius search)      [only when no startUrl]
  └─ district                     → DISTRICT_SEARCH (geo autocomplete) [only when no startUrl]
        └─ handleDistrictSearch → resolves geopath → enqueues PROPERTY_LIST

PROPERTY_LIST (handlePropertyList)
  ├─ claimListing() per EXPOSE_RESULT (run-wide dedupe, maxItems, max charge, monitoring), enqueues
  │    PROPERTY per claimed expose id with `exposeId` + the list-only fields in userData.listItem
  └─ paginates via pageNumber until runIsFull() / endPage / numberOfPages / (monitoring) a page with nothing new
        (re-derives the same search URL through `nextPageUrl`, carrying requestPayload forward)

PROPERTY (handleProperty)
  └─ handleOneProperty → pushListing (Actor.pushData; stops the crawler at the max charge)
```

Routing is a plain `switch (label)` inside `requestHandler` in `main.js`, not `createCheerioRouter`. `startUrl` wins over everything else; radius search wins over `district`; if nothing is usable, `Actor.fail()`.

**All three search types are POST** with the `LISTING_BODY` payload — region, shape and radius alike. A GET against the shape endpoint answers `{"error":"what???"}`, which is what made shape search look broken before. Only `/expose/{id}` is a GET.

`BASIC_HEADERS` sends `accept-language: en-US,en;q=0.9` deliberately: without it the API localizes by caller IP, returns German attribute labels (`'Badezimmer:'`), and every English label match in `handleOneProperty` silently misses.

### Filters

Two sources, merged in `buildSearchQuery` (ListingSearchHelper.js) as `{ sorting: 'standard', ...filters, ...extraParams }`:

- `filters` — built by `buildFilterParams()` from the actor's own inputs (rooms, size, construction year, equipment, pets, exclude projects, sortBy). Ranges are `min-max` strings with one decimal for rooms/space (`3.0-`, `-120.0`), plain ints for years.
- `extraParams` — every query param of a pasted website URL except the fixed `INTERNAL_PARAMS` set. **These win**, because the pasted URL is the more specific instruction. `price` in either source suppresses the `minPrice`/`maxPrice` filter.

Verified working API params: `numberofrooms`, `livingspace`, `constructionyear`, `equipment` (balcony, builtinkitchen, cellar, garden, lift, guesttoilet, parking, handicappedaccessible — `barrierfree` is silently ignored), `petsallowedtypes`, `exclusioncriteria`, `energyefficiencyclasses` (rent only, 412s for some types), `floor`, `apartmenttypes`, `haspromotion`, `price`, `sorting`. `sorting` accepts `standard|firstactivation|price|livingspace` with a `-` prefix for descending — `-firstactivation` is newest first (`SORTING_MAP` in consts.js). Rejected: `freeoffrom`, `numberofparkingspaces`, `heatingtypes`, `rented`, `publishedafter`.

When a `startUrl` is a website search/shape URL, `propertyType` and `operation` come from the URL path segment. `parseTypeSlug()` tries the exact `URL_SEGMENT_MAP` slug first, then falls back to token matching (`SLUG_PREFIX_TYPE` on the first token + `SLUG_OPERATION` anywhere) so SEO variants like `wohnung-mit-balkon-mieten` resolve. An unrecognized last segment is treated as part of the geopath.

### Input normalization and limits (do not regress)

`maxItems`, `endPage`, `minPrice`, `maxPrice` and `radiusKm` are `nullable` in the input schema, so the console sends a literal `null` for a cleared field. `main.js` funnels all of them through `toPositiveNumber()`, because raw `null` used to break things silently or fatally: `maxRequestsPerCrawl: null` fails Crawlee's `ow` validation and kills the run before the first request, `0 >= null` is `true` (item cap tripped immediately), and `page <= null` is `false` (pagination off after page 1). Keep any new numeric input on the same path.

`endPage` empty means every page (the old `DEFAULT_END_PAGE` of 50 silently capped runs at 1,000 listings). The API pages to the real end — verified Nov 2026 on a 12,801-listing search: page 597 of 597 served, page 598 empty; `pagesize` above 20 returns nothing. So there is no result cap and no price splitting (unlike Cian/Idealista).

### Run state, billing and monitoring (`src/state.js`)

- `RUN_STATE` in the default KV store (auto-saved, survives migration): `claimed` expose ids, `count` (claims, toward `maxItems` for the **whole run**), `pushed`, and `budget` — how many items the user's max charge covered at the start, taken once (null = no cap). `claimListing()` is synchronous so concurrent handlers can't double-claim; it returns `ok|duplicate|known|limit|budget`. Claims happen at enqueue time, so the budget check subtracts claimed-but-not-pushed listings and no detail request is made past the max charge. `failedRequestHandler` releases a claim whose detail request failed for good.
- Billing is the built-in `apify-default-dataset-item` event (Store price $1.50 Free → $0.80 Gold+, plus `apify-actor-start` $0.005). The platform charges it on dataset writes, so nothing calls `Actor.charge()`. **The SDK doesn't track that synthetic event in local runs** (local `pushData` isn't the patched client), which is why the budget is also counted from `RUN_STATE` and not only from `calculateMaxEventChargeCountWithinLimit`. Local PPE simulation: `ACTOR_MAX_TOTAL_CHARGE_USD=25 APIFY_CHARGED_ACTOR_EVENT_COUNTS='{}' APIFY_ACTOR_PRICING_INFO='{"pricingModel":"PAY_PER_EVENT","pricingPerEvent":{"actorChargeEvents":{"apify-default-dataset-item":{"eventTitle":"Result","eventPriceUsd":0.0015}}}}'` — locally every event costs $1, so that's a 25-item cap.
- Monitoring (`monitoringMode`): returned ids live in the named KV store `immoscout24-monitoring` under `SEEN-<sha1 of searchDefinition>` (built in `main.js`; saved after `crawler.run()`). The definition leaves out limits and sorting, strips `sorting`/`pagenumber` from URLs, and **only contains keys that are set** — adding a key that is always present would change every user's hash and reset their lists. Monitoring forces `sortBy: newest`; `-firstactivation` is strictly ordered across pages (verified), so `handlePropertyList` stops at the first page with no `ok` claim and at least one `known`. Pasted expose URLs are claimed in `handleProperty` with `ignoreKnown` (always returned).
- Developer-project cards (type `DEVELOPER_PROJECT_RESULT`, up to 8 of 20 on a page) are skipped — only `EXPOSE_RESULT` is scraped. A search's `totalResults` counts them, so item totals come out below it.

The input schema has no float type, so radius search takes `coordinates` as a `"lat, lng"` string that `parseCoordinates()` splits; a malformed value fails the run with a readable message.

Bad input fails loudly and early rather than producing a green empty run: `propertyType` × `operation` is validated up front, each `startUrl` is parsed in its own try/catch (a broken one is skipped with a warning), and `Actor.fail()` fires if nothing could be enqueued. `getRealEstateTypeOperation()` throws `Error`s (never bare strings — those crash the process uncaught from `main.js`) and has a `default` case.

Every search request gets a hand-built `searchUniqueKey()` (`scope-page-propertyType-operation[-extraParams]`), because the same URL otherwise dedupes away when two start URLs share a geopath with different types — and the pasted URL's own params are in the key, or two URLs of one place and type with different filters collapse into one search.

`getPriceFilter()` returns nothing without a bound: an empty `price=-` makes `compulsoryauction` searches answer 412 `ERROR_COMMON_URL_PARAMETER_NOT_SUPPORTED`. Auctions have no `obj_purchasePrice`; `price`/`marketValue` come from `obj_marketValue`.

### Output

`handleOneProperty` builds ~67 fields. The bulk comes from `adTargetingParameters` (`obj_*`), which is **language-independent** and therefore the primary source; only `baths`, `bedrooms`, `availableFrom`, `subTypology` and the price fallback are read from English attribute labels. Numbers are emitted as numbers (`price`, `size`, `rooms`, rents, year, …), flags as booleans via `toBool` (`'y'`/`'n'`/`'no_information'`), geo values de-underscored via `unslug`.

Type quirks worth remembering: houses use `obj_buildingType` + `obj_lotArea` where apartments use `obj_typeOfFlat` + `obj_livingSpace`; the `subTypology` label match must exclude the energy block (`'Energy identification type:'` also ends in `type:`); `TOP_ATTRIBUTES`'s highlighted text is the price fallback for types without a price key (e.g. garages).

`.actor/dataset_schema.json` lists every field in the `overview` view with a display format — **add new output fields there too**, or they don't show in the Apify UI, CSV or Excel. Cross-check with:

```bash
python3 -c "import json,glob;o=set();[o.update(json.load(open(f))) for f in glob.glob('$T/datasets/default/*.json')];v=set(json.load(open('.actor/dataset_schema.json'))['views']['overview']['transformation']['fields']);print(sorted(o-v),sorted(v-o))"
```

### Key files

- `src/main.js` — input parsing/normalization, monitoring `searchDefinition`, start-request building, crawler setup (`maxConcurrency: 10`, `maxRequestRetries: 8`), label routing, `failedRequestHandler`
- `src/state.js` — run state, claims, max-charge budget, `pushListing`, monitoring store
- `tasks/` — `example-tasks.json` (Store example tasks + `test-*` tasks), `create-tasks.mjs`, `download-runs.mjs`
- `src/routes.js` — `handleDistrictSearch`, `handlePropertyList`, `handleProperty`; `handleOneProperty` maps raw API JSON → output schema
- `src/ListingSearchHelper.js` — URL parsing (`parseWebSearchUrl`, `parseShapeUrl`), URL building (`getSearchUrl`, `getShapeSearchUrl`, `getRadiusSearchUrl`, `buildSearchQuery`), `buildFilterParams`, `searchUniqueKey`, `getRealEstateTypeOperation`
- `src/consts.js` — `LABELS`, `BASIC_HEADERS`, `LISTING_BODY`, `PAGE_SIZE`, `SORTING_MAP`
- `.actor/input_schema.json` — URL-first ordering: pasted URLs, then location/radius, then filters, then limits, then proxy
- `.actor/dataset_schema.json` — `overview` table view listing every output field
- `AGENTS.md` — Apify's own Actor development guide. Consult before changing anything under `.actor/` or the Actor lifecycle.
- `README.md` — user-facing docs; the paste-a-URL path leads. Keep the input table, property-type list and example output in sync with the schemas.

### API details

- Search endpoint: `POST https://api.mobile.immobilienscout24.de/search/list?...` with `searchType=region` (`geocodes=<geopath>`), `searchType=shape` (`shape=<polyline>`) or `searchType=radius` (`geocoordinates=lat;lng;radiusKm`)
- Property detail: `GET https://api.mobile.immobilienscout24.de/expose/{id}`
- Geo autocomplete: `GET .../geo/autocomplete?...`; `handleDistrictSearch` takes `results[0]` and sets `noRetry` when there is no match
- Shape URLs: the website encodes the polygon as standard Google-polyline text, base64url'd in `?shape=`; `parseShapeUrl` decodes it only when the value round-trips, otherwise passes it through as a raw polyline
- A malformed polyline or a GET on a search URL returns `{"error":"what???"}` with no `resultListItems` — `handlePropertyList` throws a readable error on that
- `pagesize` is hardcoded to 20 in the base URL
- Price: `obj_baseRent` (falling back to `obj_rent`) for rent, `obj_purchasePrice` for sale; `obj_serviceCharge`/`obj_totalRent` fill the rest
- **Requires RESIDENTIAL proxies on the platform** — datacenter proxies are blocked (local runs without a proxy work fine)

### Known rough edges

- **`gastronomy` + `sale` returns `realestatetype=industry`** in `getRealEstateTypeOperation()` (rent maps to `industry` too, with `priceType=lease`). Looks like a copy/paste slip, unverified against the API.
- **`solid-house`** is an input-schema property type with no `URL_SEGMENT_MAP` slug — reachable via the input path only.
- The Console default run timeout was 300 s (Nov 2026) — too short for a run without `maxItems` (one detail request per listing). Raise it in Console like Cian's (3600 s).
- Austrian listings get an `immobilienscout24.de/expose/<id>` `url` — it resolves, but isn't the `.at` domain.

### Store context (September 2026)

Published as `lukass/immobilien-scout24`. Competitors, their pricing and their field coverage are what the input/output/README revamp was benchmarked against; `memo23/immobilienscout24-scraper` (650 users, $0.00175/result tiered down to $0.00088) is the market leader, `azzouzana/immobilienscout-immoscout-scraper` ($0.001/result) the cheap end, `clearpath/immoscout24-api-pro` the field-count leader (102 fields). Store data is public through `https://api.apify.com/v2/store?search=...` and `https://api.apify.com/v2/acts/<user>~<name>/builds/default` (returns each competitor's `inputSchema` and `readme`).
