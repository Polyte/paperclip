import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { ovgDataSources } from "./ovg_data_sources.js";
import { ovgIngestionRuns } from "./ovg_ingestion_runs.js";

export const ovgPropertyListings = pgTable(
  "ovg_property_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    sourceId: uuid("source_id").notNull().references(() => ovgDataSources.id),
    ingestionRunId: uuid("ingestion_run_id").references(() => ovgIngestionRuns.id),
    externalId: text("external_id"),
    title: text("title"),
    make: text("make"),
    model: text("model"),
    year: integer("year"),
    price: integer("price"),
    mileage: integer("mileage"),
    vin: text("vin"),
    condition: text("condition"),
    exteriorColor: text("exterior_color"),
    interiorColor: text("interior_color"),
    transmission: text("transmission"),
    fuelType: text("fuel_type"),
    engine: text("engine"),
    driveType: text("drive_type"),
    description: text("description"),
    images: jsonb("images").$type<string[]>(),
    locationCity: text("location_city"),
    locationState: text("location_state"),
    locationZip: text("location_zip"),
    sourceUrl: text("source_url"),
    status: text("status").notNull().default("active"),
    rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("ovg_property_listings_company_idx").on(table.companyId),
    sourceIdx: index("ovg_property_listings_source_idx").on(table.sourceId),
    makeIdx: index("ovg_property_listings_make_idx").on(table.make),
    vinIdx: index("ovg_property_listings_vin_idx").on(table.vin),
    ingestedIdx: index("ovg_property_listings_ingested_idx").on(table.ingestedAt),
  }),
);
