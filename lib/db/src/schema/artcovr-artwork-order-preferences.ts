import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const artcovrArtworkOrderPreferences = pgTable(
  "artcovr_artwork_order_preferences",
  {
    clerkUserId: text("clerk_user_id").primaryKey(),
    preference: text("preference").$type<"rotate" | "shuffle">().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    preferenceCheck: check(
      "artcovr_artwork_order_preferences_preference_check",
      sql`${table.preference} in ('rotate', 'shuffle')`,
    ),
  }),
);

export const insertArtcovrArtworkOrderPreferenceSchema = createInsertSchema(
  artcovrArtworkOrderPreferences,
).omit({ updatedAt: true });
export type InsertArtcovrArtworkOrderPreference = z.infer<
  typeof insertArtcovrArtworkOrderPreferenceSchema
>;
export type ArtcovrArtworkOrderPreference =
  typeof artcovrArtworkOrderPreferences.$inferSelect;
