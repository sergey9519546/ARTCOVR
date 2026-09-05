export const MAXIMUM_ENRICHED_PROMPT_LENGTH = 12_000;

export class PromptLengthError extends Error {}

function normalize(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function buildGenerationPrompt(input: {
  artwork: { title?: string | null; category?: string | null; moodTags?: readonly string[] | null };
  userPrompt: string;
  coverText?: { title?: string | null; artistName?: string | null } | null;
  styleMode?: "exact" | "expand" | null;
  hasReferenceUpload: boolean;
}) {
  const requestedChange = normalize(input.userPrompt);
  const facts = [
    input.artwork.title ? `titled "${normalize(input.artwork.title)}"` : "",
    input.artwork.category ? `from the ${normalize(input.artwork.category)} category` : "",
    (input.artwork.moodTags ?? []).length ? `with the mood ${(input.artwork.moodTags ?? []).map(normalize).filter(Boolean).join(", ")}` : "",
  ].filter(Boolean);
  const typography = [
    input.coverText?.title ? `the title "${normalize(input.coverText.title)}"` : "",
    input.coverText?.artistName ? `the artist name "${normalize(input.coverText.artistName)}"` : "",
  ].filter(Boolean);
  const sections = [
    "PRIMARY REFERENCE IMAGE — Always use the supplied artwork image as the primary visual reference. Edit that image itself rather than inventing a disconnected scene. Preserve its composition, subject placement, framing and square aspect ratio unless the requested change explicitly asks for a change. Return one cover image with no added watermarks or signatures.",
    input.styleMode === "expand"
      ? "Treat the primary reference style as a starting point and reinterpret it only where the requested change benefits from it."
      : "Match the primary reference image's exact visual style, changing only what the requested change asks for.",
    facts.length ? `The artwork is ${facts.join(", ")}. Keep that established style unless explicitly changed.` : "",
    input.hasReferenceUpload
      ? "A secondary uploaded photo or reference image is also available. Use it according to the user's request: when they ask to add a person, face or body, place that person's likeness naturally into the primary artwork with matching lighting, perspective, scale and visual treatment. Otherwise use the upload only for the requested visual reference. Never blend it indiscriminately or let it replace the primary artwork."
      : "",
    typography.length ? `Render ${typography.join(" and ")} as legible cover typography, spelled exactly as quoted, and no other text.` : "",
    `USER'S REQUESTED CHANGE — Translate this plain-language direction into a coherent image-editing instruction while preserving the primary reference: ${requestedChange}`,
  ].filter(Boolean);
  const prompt = sections.join("\n\n");
  if (prompt.length > MAXIMUM_ENRICHED_PROMPT_LENGTH) throw new PromptLengthError();
  return prompt;
}