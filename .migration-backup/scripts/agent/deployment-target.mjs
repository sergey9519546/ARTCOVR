/**
 * Resolve the public Supabase target without allowing an ambient URL to
 * override a project ref pinned by a release command.
 */
export function resolveDeploymentTarget(argv = process.argv, env = process.env) {
  const projectRefArg = argv.find((value) => value.startsWith("--project-ref="));
  const cliProjectRef = projectRefArg?.slice("--project-ref=".length).trim() ?? "";
  const projectRef = cliProjectRef || env.SUPABASE_PROJECT_REF?.trim() || "";

  if (projectRef) {
    if (!/^[a-z0-9]{20}$/.test(projectRef)) {
      throw new Error(`Invalid Supabase project ref: ${projectRef}`);
    }
    return {
      url: `https://${projectRef}.supabase.co`,
      source: cliProjectRef ? "cli-project-ref" : "environment-project-ref",
    };
  }

  const configuredUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") || "";
  if (!configuredUrl) return { url: "", source: "missing" };
  const parsed = new URL(configuredUrl);
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("Supabase deployment probes require HTTPS except on loopback hosts.");
  }
  return { url: parsed.origin, source: "environment-url" };
}

/**
 * 401/403/405 can prove that a deployed function reached its auth/method
 * boundary. Transport failures, an absent route, and server failures cannot.
 */
export function indicatesDeployedFunction(status) {
  return Number.isInteger(status) && status >= 200 && status < 500 && status !== 404;
}
