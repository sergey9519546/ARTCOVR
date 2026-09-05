const requiredProductionVariables = [
  "DATABASE_URL",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "ARTCOVR_PUBLIC_ORIGIN",
  "ARTCOVR_STOREFRONT_ORIGINS",
  "STRIPE_WEBHOOK_SECRET",
] as const;

export function validateProductionEnvironment(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.NODE_ENV !== "production") return;

  const missing = requiredProductionVariables.filter(
    (name) => !env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Production runtime configuration is incomplete. Set: ${missing.join(", ")}.`,
    );
  }

  if (env.CLERK_PUBLISHABLE_KEY?.trim().startsWith("pk_test_")) {
    throw new Error(
      "Production runtime configuration cannot use a development Clerk publishable key.",
    );
  }
}