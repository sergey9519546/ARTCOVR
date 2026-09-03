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
    "Edit the supplied artwork image itself. Preserve its composition, subject placement, framing and square aspect ratio. Return one cover image with no added watermarks or signatures.",
    input.styleMode === "expand"
      ? "Treat the reference style as a starting point and reinterpret it where the requested change benefits from it."
      : "Match the reference image's exact visual style, changing only what the requested change asks for.",
    facts.length ? `The artwork is ${facts.join(", ")}. Keep that established style unless explicitly changed.` : "",
    input.hasReferenceUpload ? "Use the uploaded image only as a style reference; do not copy its subject, layout or lettering." : "",
    typography.length ? `Render ${typography.join(" and ")} as legible cover typography, spelled exactly as quoted, and no other text.` : "",
    `Requested change: ${input.userPrompt.trim()}`,
  ].filter(Boolean);
  const prompt = sections.join("\n\n");
  if (prompt.length > MAXIMUM_ENRICHED_PROMPT_LENGTH) throw new PromptLengthError();
  return prompt;
}