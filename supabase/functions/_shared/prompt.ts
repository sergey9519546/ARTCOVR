// Server-side prompt enrichment.
//
// The browser sends only what the user typed. What the provider receives is
// assembled here, on the server, from that text plus the owner-approved style
// facts already stored on the artwork row. There is no model call and no
// randomness: the same inputs always produce the same string, byte for byte,
// so the prompt that reaches the provider is auditable from the generations row
// and the artwork row alone.
//
// The user's text is carried verbatim (whitespace-trimmed exactly the way
// public.request_generation trims it before storing it) and always last, so the
// enrichment frames the request and never silently rewrites it. Only the
// artwork facts are whitespace-normalized, because they are interpolated into
// sentences.
//
// The combined length is bounded rather than truncated. Silently dropping the
// tail of an enriched prompt would change what the user asked for without
// telling them, so an over-long combination is a 400 at the Edge Function.

export type PromptArtworkAnchor = {
  title?: string | null;
  category?: string | null;
  moodTags?: readonly string[] | null;
};

export type PromptEnrichmentInput = {
  artwork: PromptArtworkAnchor;
  userPrompt: string;
  hasReferenceUpload: boolean;
};

// Matches the char_length bound on generations.prompt, so an enriched prompt can
// never be longer than the longest prompt the database is willing to record.
export const MAXIMUM_ENRICHED_PROMPT_LENGTH = 12000;

export class PromptLengthError extends Error {
  length: number;
  maximum: number;

  constructor(length: number, maximum: number) {
    super(`Enriched prompt is ${length} characters; the limit is ${maximum}.`);
    this.name = "PromptLengthError";
    this.length = length;
    this.maximum = maximum;
  }
}

export const REFERENCE_FIDELITY_INSTRUCTION =
  "Edit the supplied artwork image itself. Preserve its composition, subject placement, framing and square aspect ratio, and return a single cover image with no added text, lettering, borders, frames, watermarks or signatures.";

export const REFERENCE_UPLOAD_INSTRUCTION =
  "A second image is supplied only as a style reference. Transfer its palette, colour temperature, lighting and surface texture onto the artwork's existing composition. Do not copy its subject, objects, layout, lettering or any likeness from it, and do not treat it as the image being edited.";

function normalize(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function styleAnchor(artwork: PromptArtworkAnchor): string {
  const title = normalize(artwork.title);
  const category = normalize(artwork.category);
  const tags: string[] = [];
  for (const tag of artwork.moodTags ?? []) {
    const normalized = normalize(tag);
    if (normalized.length > 0 && !tags.includes(normalized)) tags.push(normalized);
  }

  const facts: string[] = [];
  if (title.length > 0) facts.push(`titled "${title}"`);
  if (category.length > 0) facts.push(`from the ${category} category`);
  if (tags.length > 0) facts.push(`established with the mood ${tags.join(", ")}`);
  if (facts.length === 0) return "";
  return `The artwork being edited is ${facts.join(", ")}. Keep that established style unless the requested change below explicitly alters it.`;
}

export function buildGenerationPrompt(input: PromptEnrichmentInput): string {
  const sections = [
    REFERENCE_FIDELITY_INSTRUCTION,
    styleAnchor(input.artwork),
    input.hasReferenceUpload ? REFERENCE_UPLOAD_INSTRUCTION : "",
    `Requested change: ${input.userPrompt.trim()}`,
  ];
  const combined = sections.filter((section) => section.length > 0).join("\n\n");
  if (combined.length > MAXIMUM_ENRICHED_PROMPT_LENGTH) {
    throw new PromptLengthError(combined.length, MAXIMUM_ENRICHED_PROMPT_LENGTH);
  }
  return combined;
}
