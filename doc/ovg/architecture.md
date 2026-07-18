# OVG Property Data Ingestion Pipeline — Architecture

## Overview

The OVG (Open Vehicle Garage) property data ingestion pipeline is a modular ETL
system for collecting, normalizing, and storing vehicle property listings from
disparate external sources. It follows a **Connector → Normalization → Storage**
architecture, where each data source is accessed through a pluggable connector
adapter and records are canonicalized into a uniform schema.

## Goals

- Support ingestion from multiple source types (CSV, REST APIs, webhooks)
- Preserve raw source data alongside canonical fields for audit and reprocessing
- Track ingestion runs per source for observability and retry
- Be extensible to new source types with minimal code (add a connector class)

## Pipeline Stages

```
┌────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐
│ Data Source │──▶│  Connector   │──▶│ Normalization │──▶│  Storage    │
│ (CSV, API,  │   │  (adapter)   │   │  (canonical   │   │  (DB/API)   │
│  webhook)   │   │              │   │   transform)  │   │             │
└────────────┘   └──────────────┘   └──────────────┘   └─────────────┘
```

### 1. Data Sources

External origins of vehicle property data:

- **CSV files** — bulk exports from dealerships, auction houses, or aggregators
- **REST APIs** — third-party vehicle data providers
- **Webhooks** — push-based incremental updates (future)
- **Web scraping** — public listing sites (future)

### 2. Connectors (Adapters)

Each source type has a corresponding connector class implementing a common
interface:

```typescript
interface DataSourceConnector {
  readonly type: string;
  fetch(config: ConnectorConfig): AsyncGenerator<RawRecord>;
}
```

Connectors yield raw records as plain objects. The system does not assume any
particular shape from a connector — normalization happens downstream.

Built-in connectors:

| Connector   | Type    | Config fields                              |
|-------------|---------|--------------------------------------------|
| CsvConnector| `csv`   | `filePath`, `url`, `delimiter`, `encoding` |
| JsonApiConnector | `api` | `baseUrl`, `endpoint`, `apiKey`, `pagination` |

### 3. Normalization Layer

Raw records pass through a normalization function that maps source-specific
fields to the canonical property listing schema. The normalizer is connector-
aware so different sources can have different field mappings.

| Canonical field   | CSV column         | API field            |
|-------------------|--------------------|----------------------|
| `make`            | make / brand       | vehicle.make          |
| `model`           | model              | vehicle.model         |
| `year`            | year / model_year  | vehicle.year          |
| `price`           | price / asking_price| pricing.salePrice    |
| `mileage`         | mileage / odometer | odometer.miles        |
| `vin`             | vin / VIN          | vin / vehicle.vin     |
| `condition`       | condition          | condition.description |
| `exteriorColor`   | ext_color / color  | color.exterior        |
| `interiorColor`   | int_color          | color.interior        |
| `transmission`    | transmission       | drivetrain.transmission|
| `fuelType`        | fuel / fuel_type   | engine.fuelType       |
| `engine`          | engine             | engine.description    |
| `driveType`       | drive / drivetrain | drivetrain.type       |
| `description`     | description / notes| vehicle.description   |
| `images`          | image_urls         | media.images          |
| `location`        | city / state / zip | dealer.address        |
| `sourceUrl`       | url / listing_url  | listing.url           |

### 4. Storage

Normalized records are inserted into the `ovg_property_listings` table. The
raw `raw_data` JSONB column preserves the original connector output for audit
trails and reprocessing.

Each ingestion run is recorded in `ovg_ingestion_runs` for observability
(status, counts, timestamps, error summary).

## Database Schema

### `ovg_data_sources`

Tracks configured data sources (one per connector instance).

| Column       | Type      | Notes                         |
|--------------|-----------|-------------------------------|
| id           | uuid      | PK, auto-generated            |
| company_id   | uuid      | FK → companies.id             |
| name         | text      | Human-readable label          |
| type         | text      | Connector type (`csv`, `api`) |
| config       | jsonb     | Connector-specific config     |
| enabled      | boolean   | Whether source is active      |
| created_at   | timestamptz|                               |
| updated_at   | timestamptz|                               |

### `ovg_property_listings`

Canonical vehicle property listing records.

| Column          | Type      | Notes                         |
|-----------------|-----------|-------------------------------|
| id              | uuid      | PK, auto-generated            |
| company_id      | uuid      | FK → companies.id             |
| source_id       | uuid      | FK → ovg_data_sources.id      |
| ingestion_run_id| uuid      | FK → ovg_ingestion_runs.id    |
| external_id     | text      | ID from source system         |
| title           | text      | Listing title                 |
| make            | text      | Vehicle manufacturer          |
| model           | text      | Vehicle model                 |
| year            | integer   | Model year                    |
| price           | integer   | Price in cents                |
| mileage         | integer   | Odometer reading in miles     |
| vin             | text      | Vehicle identification number |
| condition       | text      | `new`, `used`, `certified`    |
| exterior_color  | text      |                               |
| interior_color  | text      |                               |
| transmission    | text      | `automatic`, `manual`         |
| fuel_type       | text      | `gasoline`, `diesel`, `electric`, `hybrid` |
| engine          | text      | Engine description             |
| drive_type      | text      | `AWD`, `FWD`, `RWD`, `4WD`   |
| description     | text      | Free-text description         |
| images          | jsonb     | Array of image URLs           |
| location_city   | text      |                               |
| location_state  | text      |                               |
| location_zip    | text      |                               |
| source_url      | text      | Original listing URL          |
| raw_data        | jsonb     | Full original record          |
| ingested_at     | timestamptz| When record was ingested     |
| created_at      | timestamptz|                               |
| updated_at      | timestamptz|                               |

### `ovg_ingestion_runs`

Tracks execution of a single ingestion for a data source.

| Column          | Type      | Notes                         |
|-----------------|-----------|-------------------------------|
| id              | uuid      | PK, auto-generated            |
| company_id      | uuid      | FK → companies.id             |
| source_id       | uuid      | FK → ovg_data_sources.id      |
| status          | text      | `running`, `completed`, `failed` |
| records_fetched | integer   | Total records from connector  |
| records_ingested| integer   | Successfully stored records   |
| records_failed  | integer   | Records that failed to store  |
| errors          | jsonb     | Array of error descriptions   |
| started_at      | timestamptz|                               |
| completed_at    | timestamptz|                               |
| created_at      | timestamptz|                               |

## API Endpoints

All endpoints are prefixed with `/api/companies/:companyId/ovg`.

| Method | Path                              | Description                  |
|--------|-----------------------------------|------------------------------|
| GET    | /sources                          | List data sources            |
| POST   | /sources                          | Create a data source         |
| GET    | /sources/:sourceId                | Get source details           |
| PATCH  | /sources/:sourceId                | Update source config         |
| DELETE | /sources/:sourceId                | Delete a source              |
| POST   | /sources/:sourceId/ingest         | Trigger ingestion run        |
| GET    | /sources/:sourceId/runs           | List runs for a source       |
| GET    | /runs/:runId                      | Get run details              |
| GET    | /listings                         | Query property listings      |
| GET    | /listings/:listingId              | Get single listing           |

## Connector Development

To add a new connector type:

1. Create a class implementing `DataSourceConnector` in
   `server/src/services/ovg-connectors/`
2. Register it in the connector registry (`ovg-connectors/index.ts`)
3. Add the type string to `OvgDataSourceType` in shared types
4. (Optional) Add a config schema to the shared validators

## Future Work

- Incremental / delta ingestion (webhooks, change tracking)
- Scheduled ingestion (cron triggers via Paperclip routines)
- Data quality scoring and deduplication
- Enrichment pipeline (VIN decoding, market pricing)
- Export pipeline (feed to search index, caching tier)
