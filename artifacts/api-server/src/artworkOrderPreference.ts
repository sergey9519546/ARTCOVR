import { eq } from "drizzle-orm";
import { artcovrArtworkOrderPreferences, db } from "@workspace/db";

export type ArtworkOrderPreference = "rotate" | "shuffle";

export async function getArtworkOrderPreference(clerkUserId: string) {
  const [row] = await db
    .select({ preference: artcovrArtworkOrderPreferences.preference })
    .from(artcovrArtworkOrderPreferences)
    .where(eq(artcovrArtworkOrderPreferences.clerkUserId, clerkUserId))
    .limit(1);

  return row?.preference ?? null;
}

export async function saveArtworkOrderPreference(
  clerkUserId: string,
  preference: ArtworkOrderPreference,
) {
  const [row] = await db
    .insert(artcovrArtworkOrderPreferences)
    .values({ clerkUserId, preference })
    .onConflictDoUpdate({
      target: artcovrArtworkOrderPreferences.clerkUserId,
      set: { preference, updatedAt: new Date() },
    })
    .returning({ preference: artcovrArtworkOrderPreferences.preference });

  return row.preference;
}
