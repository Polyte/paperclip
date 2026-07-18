import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const rateLimitEntries = pgTable(
  "rate_limit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: index("rate_limit_entries_key_idx").on(table.key),
    keyCreatedAtIdx: index("rate_limit_entries_key_created_at_idx").on(table.key, table.createdAt),
  }),
);
