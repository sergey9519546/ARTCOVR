export const EDIT_PROMPT_MAX_LENGTH = 2000;

export type EditorDraft = {
  prompt: string;
  coverTitle: string;
  coverArtist: string;
  styleMode: "exact" | "expand";
};

export function parseEditorDraft(value: string | null): EditorDraft {
  const empty: EditorDraft = { prompt: "", coverTitle: "", coverArtist: "", styleMode: "exact" };
  if (!value) return empty;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
    const draft = parsed as Record<string, unknown>;
    return {
      prompt: typeof draft.prompt === "string" ? draft.prompt.slice(0, EDIT_PROMPT_MAX_LENGTH) : "",
      coverTitle: typeof draft.coverTitle === "string" ? draft.coverTitle.slice(0, 120) : "",
      coverArtist: typeof draft.coverArtist === "string" ? draft.coverArtist.slice(0, 120) : "",
      styleMode: draft.styleMode === "expand" ? "expand" : "exact",
    };
  } catch {
    return empty;
  }
}

/** Draft text stays in this tab; image URLs and upload IDs are never persisted. */
export function readEditorDraft(artworkId: string): EditorDraft {
  try {
    return parseEditorDraft(sessionStorage.getItem(`artcovr:editor-draft:${artworkId}`));
  } catch {
    return parseEditorDraft(null);
  }
}

export function writeEditorDraft(artworkId: string, draft: EditorDraft): void {
  try {
    const key = `artcovr:editor-draft:${artworkId}`;
    if (!draft.prompt && !draft.coverTitle && !draft.coverArtist && draft.styleMode === "exact") {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(draft));
    }
  } catch {
    // The editor remains usable when the browser denies tab storage.
  }
}

export function hasPromptClause(prompt: string, clause: string) {
  return prompt.includes(clause);
}

/** Decline an over-limit suggestion without truncating the user's own text. */
export function togglePromptClause(prompt: string, clause: string) {
  if (hasPromptClause(prompt, clause)) return prompt.split(clause).join("").trim();
  const next = `${prompt}${prompt && !/\s$/.test(prompt) ? " " : ""}${clause}`;
  return next.length <= EDIT_PROMPT_MAX_LENGTH ? next : prompt;
}
