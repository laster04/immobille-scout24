# Actor - ImmobileScout24 Scraper

## ImmobileScout24 scraper

The ImmobileScout24 data scraper supports the following features:

-   Scrape property details - You can scrape attributes like property images, price, features and many more. You can find details below.

-   Scrape for sale properties - If you are looking for a property which is for sale, you can directly target them.

-   Scrape rental properties - Rental properties can be directly targeted.

-   Scrape by keyword - You can use location-wise keywords to search specific search lists. Also you can directly point out rental, for sale or sold properties on this feature.

-   Scrape properties by filter - Auto detection of URLs helps you to directly copy/paste the URLs into the scraper to apply any filtering you like.
-   Through the new policy of web the exact location of some properties is hidden. So the scraper now get center of map which is accessible from detail of property.

## Input Parameters

The input of this scraper should be JSON containing the list of pages on Realtor that should be visited. Required fields are:

| Field        | Type    | Description                                                                                                     |
|--------------|---------|-----------------------------------------------------------------------------------------------------------------|
| district     | String  | (optional) Keyword that can be searched in Realtor search engine.                                               |
| country      | String  | (required) Select country where your search would be.                                                           |
| operation    | String  | (required) sale \| rent                                                                                         |
| propertyType | String  | (optional) You can choose property type (default **apartment**)                                                 |
| maxItems     | Integer | (optional) You can limit scraped products. This should be useful when you search through the big subcategories. |
| endPage      | Integer | (optional) Final number of page that you want to scrape. Default is 50 pages. This option overrides maxItems.   |
| startUrls    | Array   | (optional) List of ImmobilleScout URLs. You should only provide property detail or search URLs(beta)            |
| proxy        | Object  | (required) Proxy configuration                                                                                  |

This solution requires the use of **Proxy servers**, either your own proxy servers or you can use [Apify Proxy](https://www.apify.com/docs/proxy). Scraper works only with **RESIDENTIAL** proxies right now.

## Example Result

``` json
{
	"url": "https://www.immobilienscout24.de/expose/157410302",
	"id": "157410302",
	"typology": "apartment",
	"price": "714000",
	"size": "100.53",
	"contacts": {
		"commercialName": "WvM Vertriebsgesellschaft mbH",
		"contactName": "Wir freuen uns auf Sie. Ihr Team der WvM Vertriebsgesellschaft mbH",
		"rating": "(4.3 stars)",
		"phones": []
	},
	"photos": [
		"https://pictures.immobilienscout24.de/listings/fedae27f-7793-4f42-bae3-ad9ea435c760-1968121293.jpg/ORIG/resize/1500x1000/format/webp/quality/80",
		"https://pictures.immobilienscout24.de/listings/b2682f75-c248-4c15-a163-737b9e662e17-1930258928.jpg/ORIG/resize/1500x1000/format/webp/quality/80",
		"https://pictures.immobilienscout24.de/listings/68c701b6-820d-4a7d-81aa-689bb5d6eedb-1930258930.jpg/ORIG/resize/1500x1000/format/webp/quality/80",
		"https://pictures.immobilienscout24.de/listings/826b1686-e723-4079-9366-ad6acd07772d-1930258929.jpg/ORIG/resize/1500x1000/format/webp/quality/80",
		"https://pictures.immobilienscout24.de/listings/4cd97f4f-63fe-4094-aae1-acc092ce0343-1930258941.jpg/ORIG/resize/1500x1000/format/webp/quality/80",
		"https://pictures.immobilienscout24.de/listings/b0ea7f7c-a94d-4b96-a513-ec323fb76a3a-1930258934.jpg/ORIG/resize/1500x1000/format/webp/quality/80",
		"https://pictures.immobilienscout24.de/listings/aa391248-5c5e-4d90-b687-a306cdfeb18c-1930258935.jpg/ORIG/resize/1500x1000/format/webp/quality/80",
		"https://pictures.immobilienscout24.de/listings/ffae9c77-bb9a-4dcc-bded-9f9feca75741-1928840786.jpg/ORIG/resize/1500x1000/format/webp/quality/80",
		"https://pictures.immobilienscout24.de/listings/8b9d405d-22b1-4343-9756-b1ec5bd6534b-1968121295.png/ORIG/resize/1500x1000/format/webp/quality/80",
		"https://pictures.immobilienscout24.de/listings/997ee7a1-32a0-424f-a6a3-e2c6480208c9-1970782285.jpg/ORIG/resize/1500x1000/format/webp/quality/80"
	],
	"tour3d": [],
	"rooms": "3",
	"title": "Moderne 4-Zimmer-Wohnung mit Balkon, Aufzug im Neubau!",
	"latitude": 52.53749,
	"longitude": 13.47987,
	"address": "Berkenbrücker Steig 18-19 13055 Alt-Hohenschönhausen, Berlin",
	"subTypology": "Flat",
	"baths": "2"
}
```

## Bugs, fixes, updates and changelog
If you have any feature requests you can create an issue from [here](https://github.com/laster04/Idealista-scraper/issues).
[Here](https://github.com/laster04/Idealista-scraper/blob/main/CHANGELOG.md) is changelog with new features and bugfixes info.
