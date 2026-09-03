import type { CorsOptions } from "cors";
import type { NextFunction, Request, RequestHandler, Response } from "express";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type OriginEnvironment = Record<string, string | undefined>;

function configuredOriginValues(env: OriginEnvironment = process.env) {
  const allowlist =
    env.ARTCOVR_STOREFRONT_ORIGINS ?? env.ARTCOVR_ALLOWED_ORIGINS;
  const values = allowlist
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

  if (env.ARTCOVR_PUBLIC_ORIGIN?.trim()) {
    values.push(env.ARTCOVR_PUBLIC_ORIGIN.trim());
  } else if (!allowlist?.trim() && env.VITE_SITE_URL?.trim()) {
    values.push(env.VITE_SITE_URL.trim());
  }

  if (values.length > 0) return values;

  // REPLIT_DOMAINS is platform-provided configuration, not a request header.
  // It is a useful development/deployment fallback when the app-specific
  // values have not been set yet.
  return (env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.includes("://") ? value : `https://${value}`));
}

export function normalizeOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  return url.origin;
}

export function getConfiguredStorefrontOrigins(
  env: OriginEnvironment = process.env,
) {
  const values = configuredOriginValues(env);
  const origins = new Set<string>();

  for (const value of values) {
    const origin = normalizeOrigin(value);
    if (!origin) {
      throw new Error(
        `Invalid storefront origin "${value}". Configure an http(s) origin without a path.`,
      );
    }
    origins.add(origin);
  }

  return origins;
}

export function getTrustedPublicOrigin(
  env: OriginEnvironment = process.env,
) {
  const configured =
    env.ARTCOVR_PUBLIC_ORIGIN ??
    env.VITE_SITE_URL ??
    getConfiguredStorefrontOrigins(env).values().next().value;
  const origin = configured
    ? normalizeOrigin(configured.includes("://") ? configured : `https://${configured}`)
    : null;

  if (!origin) {
    throw new Error(
      "ARTCOVR_PUBLIC_ORIGIN must be configured as the trusted public storefront origin.",
    );
  }

  if (env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new Error("ARTCOVR_PUBLIC_ORIGIN must use HTTPS in production.");
  }

  return origin;
}

export function isAllowedStorefrontOrigin(
  origin: string | undefined,
  env: OriginEnvironment = process.env,
) {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  return normalized !== null && getConfiguredStorefrontOrigins(env).has(normalized);
}

function originFromReferer(referer: string) {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function browserMutationOriginGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!MUTATION_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin")?.trim() || undefined;
  const referer = req.get("referer")?.trim() || undefined;
  const refererOrigin = referer ? originFromReferer(referer) : null;

  if (
    !origin &&
    !refererOrigin
  ) {
    res.status(403).json({
      code: "csrf_origin_required",
      message: "A trusted browser origin is required for this request.",
    });
    return;
  }

  if (
    (origin && !isAllowedStorefrontOrigin(origin)) ||
    (referer && !refererOrigin) ||
    (refererOrigin && !isAllowedStorefrontOrigin(refererOrigin)) ||
    (origin && refererOrigin && normalizeOrigin(origin) !== refererOrigin)
  ) {
    res.status(403).json({
      code: "csrf_origin_forbidden",
      message: "This browser origin is not allowed to change account or checkout state.",
    });
    return;
  }

  next();
}

export function disallowUnknownPreflight(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (
    req.method === "OPTIONS" &&
    req.get("origin") &&
    !isAllowedStorefrontOrigin(req.get("origin")?.trim())
  ) {
    res.status(403).json({
      code: "cors_origin_forbidden",
      message: "This browser origin is not allowed to access the API.",
    });
    return;
  }

  next();
}

export function trustedCorsOptions(): CorsOptions {
  return {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, false);
        return;
      }
      callback(null, isAllowedStorefrontOrigin(origin) ? origin : false);
    },
  };
}

export const browserMutationProtection: RequestHandler = browserMutationOriginGuard;