import { pgTable, uuid, text, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const ovgDataSources = pgTable(
  "ovg_data_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("ovg_data_sources_company_idx").on(table.companyId),
  }),
);
