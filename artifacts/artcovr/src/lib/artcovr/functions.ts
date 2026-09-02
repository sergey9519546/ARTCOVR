import { ArtcovrApiError as ArtcovrApiErrorBase } from "@/lib/artcovr/api-error";

export class ArtcovrApiError extends ArtcovrApiErrorBase {}

export type GenerationRequest = {
  artworkId: string;
  prompt: string;
  purchaseId?: string;
  /** A prior generated result to continue editing from. */
  referenceGenerationId?: string;
  /**
   * An image the user uploaded through {@link uploadReference}, used only as a
   * style reference. Mutually exclusive with `referenceGenerationId`; sending
   * both is rejected with 400 `dual_reference_conflict`.
   */
  referenceUploadId?: string;
  resetToBase?: boolean;
  /**
   * Optional cover typography rendered INTO the generated image by the model.
   * Verbatim spelling is enforced server-side in the enrichment template.
   */
  coverText?: { title?: string; artistName?: string };
  /** "exact" (default) locks the reference style; "expand" allows reinterpretation. */
  styleMode?: "exact" | "expand";
};

export type ReferenceUploadResponse = { referenceUploadId: string };

/** Media types the reference upload endpoint accepts. */
export const REFERENCE_UPLOAD_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Byte ceiling the reference upload endpoint enforces server-side. */
export const REFERENCE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export type GenerationResponse = {
  generationId: string;
  status: "queued" | "running";
  statusUrl: string;
};

export type GenerationStatus = {
  generationId: string;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "blocked"
    | "failed"
    | "timed_out";
  previewUrl?: string;
  cleanUrl?: string;
  errorCode?: string | null;
  finishedAt?: string | null;
};

export type AccountPurchase = {
  id: string;
  artworkId: string;
  artworkTitle: string;
  artworkSlug: string;
  saleMode: "exclusive" | "repeatable";
  status: "reserved" | "pending" | "paid" | "expired" | "refunded";
  amountCents: number;
  currency: string;
  paidAt: string | null;
  entitlementExpiresAt: string | null;
  selectedPreviewGenerationId: string | null;
  resetSource: "original";
  accessRevokedAt: string | null;
  accessRevocationReason: string | null;
  remainingGenerations: number;
};

export type AccountGeneration = {
  id: string;
  artworkId: string;
  purchaseId: string | null;
  prompt: string;
  phase: "preview" | "purchased";
  status: GenerationStatus["status"];
  createdAt: string;
  expiresAt: string;
  previewUrl?: string;
  cleanUrl?: string;
};

export type AccountDownload = {
  kind: "base" | "selected_preview" | "purchased_result";
  purchaseId: string;
  artworkId: string;
  generationId: string | null;
  expiresAt: string;
  url: string;
};

export type AccountData = {
  purchases: AccountPurchase[];
  generations: AccountGeneration[];
  downloads: AccountDownload[];
};

export type OwnerCatalogIntelligenceAccess = {
  authorized: true;
  role: "curator";
  capabilities: {
    aggregateInsights: boolean;
    visualDiversityMap: boolean;
    duplicateReview: boolean;
  };
};

type ErrorPayload = { message?: string; error?: string; code?: string };

async function readPayload<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (!response.ok) {
    throw new ArtcovrApiError(
      response.status,
      payload.code || payload.error || "request_failed",
      payload.message || payload.error || "We could not complete that request.",
    );
  }
  return payload;
}

async function request<T>(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
  return readPayload<T>(response);
}

async function localRequest<T>(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
  return readPayload<T>(response);
}

// Image uploads are sent as a raw body with the file's own media type: there is
// no JSON envelope to base64-inflate the bytes into, and no multipart form for a
// caller to smuggle an extra field through. The browser sends the Clerk session
// cookie automatically; it never reads or constructs a session token.
async function requestBinary<T>(path: string, body: Blob, contentType: string) {
  const headers = new Headers();
  headers.set("Content-Type", contentType);

  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
    credentials: "same-origin",
  });
  return readPayload<T>(response);
}

/**
 * Uploads one image to use as a style reference for a later generation.
 *
 * The type and size checks below are a courtesy so an unusable file is refused
 * before it is sent; the Edge Function re-applies both to the bytes it actually
 * receives, decodes them, and re-encodes the image before storing it. The
 * returned id is opaque: it names no bucket, path or URL, and only the server
 * can resolve it back to an object.
 *
 * Pass it to {@link createGeneration} as `referenceUploadId`. It is single-use,
 * bound to the artwork it was uploaded for, and expires after 24 hours.
 */
export async function uploadReference(
  file: Blob,
  artworkId: string,
): Promise<ReferenceUploadResponse> {
  const mediaType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!(REFERENCE_UPLOAD_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    throw new ArtcovrApiError(
      415,
      "unsupported_media_type",
      "Upload a JPEG, PNG or WebP image.",
    );
  }
  if (file.size === 0) {
    throw new ArtcovrApiError(400, "invalid_request", "That file is empty.");
  }
  if (file.size > REFERENCE_UPLOAD_MAX_BYTES) {
    throw new ArtcovrApiError(
      413,
      "reference_too_large",
      "Reference images must be 8 MB or smaller.",
    );
  }
  return requestBinary<ReferenceUploadResponse>(
    `/functions/v1/upload-reference?artworkId=${encodeURIComponent(artworkId)}`,
    file,
    mediaType,
  );
}

export function createGeneration(requestBody: GenerationRequest) {
  return request<GenerationResponse>("/functions/v1/generate-image", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export function getGenerationStatus(generationId: string) {
  return request<GenerationStatus>(
    `/functions/v1/generation-status?generationId=${encodeURIComponent(generationId)}`,
    { method: "GET" },
  );
}

export function createCheckout(
  artworkId: string,
  idempotencyKey: string,
  selectedPreviewId?: string,
  email?: string,
) {
  return localRequest<{
    purchaseId: string;
    checkoutUrl: string;
    expiresAt: string;
  }>("/checkout", {
    method: "POST",
    body: JSON.stringify({
      artworkId,
      idempotencyKey,
      selectedPreviewId: selectedPreviewId || null,
      email: email || null,
    }),
  });
}

export function getMyImages() {
  return request<AccountData>("/functions/v1/my-images", { method: "GET" });
}

export function getOwnerCatalogIntelligenceAccess() {
  return request<OwnerCatalogIntelligenceAccess>(
    "/owner/catalog-intelligence",
    { method: "GET" },
  );
}

export function submitInquiry(name: string, message: string) {
  return request<{ inquiryId: string; createdAt: string }>(
    "/functions/v1/submit-inquiry",
    {
      method: "POST",
      body: JSON.stringify({ name: name.trim() || undefined, message: message.trim() }),
    },
  );
}
