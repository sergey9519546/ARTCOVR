export type RegenerationRequiredSource = {
  sourcePool: "generated_images" | "new_meta_images";
  sourceOrdinal?: number;
  sourcePath: string;
  sourceSha256: string;
  reason: "regeneration_required";
};

// These identities are permanently excluded. A regenerated replacement must
// enter review as a new file with a new SHA-256; never overwrite or reuse Q101.
export const REGENERATION_REQUIRED_SOURCES: readonly RegenerationRequiredSource[] = [
  {
    sourcePool: "generated_images",
    sourceOrdinal: 101,
    sourcePath: "E:\\ART_COLLECTION\\generated_images\\101_tactile-voxel-whimsy.png",
    sourceSha256: "f8cd8331c771055b29a2080178c501157741689f8e18578706f08ada7f895471",
    reason: "regeneration_required",
  },
  {
    sourcePool: "new_meta_images",
    sourcePath: "E:\\ART_COLLECTION\\NEW META IMAGES\\metaai_20260608_0101.png",
    sourceSha256: "08cbcad2e4cdfc9f3e87dd1f776b52aca164b0ff561df21f3c2d2add04b8fd02",
    reason: "regeneration_required",
  },
];

export const REGENERATION_REQUIRED_SOURCE_HASHES = new Set(
  REGENERATION_REQUIRED_SOURCES.map(({ sourceSha256 }) => sourceSha256),
);
