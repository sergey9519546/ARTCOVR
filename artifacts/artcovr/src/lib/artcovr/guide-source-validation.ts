import type { AnswerGuideSource } from "./answer-guides";
import { STATIC_METADATA } from "./route-metadata";

export type GuideSourceValidationFailure = {
  reason: string;
};

export type ExternalGuideSourceResult =
  | { ok: true; status: number; finalUrl: string }
  | { ok: false; reason: string; status?: number; finalUrl?: string };

export function isAcceptableExternalStatus(status: number) {
  return status >= 200 && status < 400;
}

/**
 * First-party citations are checked from the local route contract. They do not
 * need a network request, which keeps the opt-in external check deterministic
 * for local development and resilient to the site's own uptime.
 */
export function validateFirstPartyGuideSource(
  guidePath: string,
  source: AnswerGuideSource,
): GuideSourceValidationFailure | null {
  if (source.kind !== "first-party") return null;

  if (!source.href.startsWith("/") || source.href.startsWith("//")) {
    return { reason: "first-party source must use a root-relative path" };
  }

  let parsed: URL;
  try {
    parsed = new URL(source.href, "https://artcovr.local");
  } catch {
    return { reason: "first-party source has an invalid route" };
  }

  if (parsed.search || parsed.hash) {
    return { reason: "first-party source must not include a query or hash" };
  }

  const metadata = STATIC_METADATA[parsed.pathname];
  if (!metadata) {
    return { reason: `route ${parsed.pathname} is not in public route metadata` };
  }
  if (!metadata.index) {
    return { reason: `route ${parsed.pathname} is not indexable public content` };
  }

  return null;
}

export function validateGuideSourceDefinition(
  guidePath: string,
  source: AnswerGuideSource,
): GuideSourceValidationFailure | null {
  if (source.kind === "first-party") {
    return validateFirstPartyGuideSource(guidePath, source);
  }

  let parsed: URL;
  try {
    parsed = new URL(source.href);
  } catch {
    return { reason: "external source has an invalid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { reason: "external source must use HTTPS" };
  }
  if (parsed.username || parsed.password) {
    return { reason: "external source must not include credentials" };
  }

  return null;
}

export async function checkExternalGuideSource(
  href: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<ExternalGuideSourceResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const request = (method: "HEAD" | "GET") =>
    fetcher(href, {
      method,
      redirect: "follow",
      signal: controller.signal,
      ...(method === "GET" ? { headers: { Range: "bytes=0-0" } } : {}),
    });

  try {
    let response = await request("HEAD");
    // Some government and document hosts do not implement HEAD. A bounded
    // GET fallback avoids treating those valid citations as unavailable.
    if ([403, 405, 501].includes(response.status)) {
      response = await request("GET");
    }

    const finalUrl = response.url || href;
    if (!isAcceptableExternalStatus(response.status)) {
      return {
        ok: false,
        status: response.status,
        finalUrl,
        reason: `received HTTP ${response.status}`,
      };
    }
    if (!finalUrl.startsWith("https://")) {
      return {
        ok: false,
        status: response.status,
        finalUrl,
        reason: "redirected to a non-HTTPS URL",
      };
    }

    return { ok: true, status: response.status, finalUrl };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && error.name === "AbortError"
          ? `timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : "request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}