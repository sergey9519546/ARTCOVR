import {
  getSupabaseBrowserClient,
  getSupabasePublicConfig,
} from "@/lib/supabase/client";
import { ArtcovrApiError as ArtcovrApiErrorBase } from "@/lib/artcovr/api-error";

export class ArtcovrApiError extends ArtcovrApiErrorBase {}

export type GenerationRequest = {
  artworkId: string;
  prompt: string;
  purchaseId?: string;
  referenceGenerationId?: string;
  resetToBase?: boolean;
};

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

type ErrorPayload = { message?: string; error?: string; code?: string };

async function request<T>(path: string, init: RequestInit) {
  const config = getSupabasePublicConfig();
  const client = getSupabaseBrowserClient();
  if (!config || !client) {
    throw new ArtcovrApiError(
      503,
      "account_services_unavailable",
      "ARTCOVR account services are not configured yet.",
    );
  }

  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new ArtcovrApiError(
      401,
      "unauthorized",
      "Sign in with your email before continuing.",
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  headers.set("apikey", config.anonKey);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
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
) {
  return request<{
    purchaseId: string;
    checkoutUrl: string;
    expiresAt: string;
  }>("/functions/v1/create-checkout", {
    method: "POST",
    body: JSON.stringify({
      artworkId,
      idempotencyKey,
      selectedPreviewId: selectedPreviewId || null,
    }),
  });
}

export function getMyImages() {
  return request<AccountData>("/functions/v1/my-images", { method: "GET" });
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
