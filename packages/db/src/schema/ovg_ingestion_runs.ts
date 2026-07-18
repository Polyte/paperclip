import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { ovgDataSources } from "./ovg_data_sources.js";

export const ovgIngestionRuns = pgTable(
  "ovg_ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    sourceId: uuid("source_id").notNull().references(() => ovgDataSources.id),
    status: text("status").notNull().default("pending"),
    recordsFetched: integer("records_fetched").notNull().default(0),
    recordsIngested: integer("records_ingested").notNull().default(0),
    recordsFailed: integer("records_failed").notNull().default(0),
    errors: jsonb("errors").$type<string[]>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("ovg_ingestion_runs_company_idx").on(table.companyId),
    sourceIdx: index("ovg_ingestion_runs_source_idx").on(table.sourceId),
  }),
);
