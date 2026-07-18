import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const biometricSelfies = pgTable(
  "biometric_selfies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    encryptedData: jsonb("encrypted_data").$type<{
      scheme: string;
      iv: string;
      tag: string;
      ciphertext: string;
    }>().notNull(),
    contentType: text("content_type").notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusIdx: index("biometric_selfies_user_status_idx").on(table.userId, table.status),
    createdAtIdx: index("biometric_selfies_created_at_idx").on(table.createdAt),
  }),
);
