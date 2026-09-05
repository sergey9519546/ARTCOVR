import OpenAI from "openai";

// Missing generation credentials must not take down checkout or the public API.
export function getOpenAI(env: NodeJS.ProcessEnv = process.env) {
  const directKey = env.OPENAI_API_KEY?.trim();
  if (directKey) {
    // A direct OpenAI credential must never be forwarded to the managed proxy
    // or to a stale OPENAI_BASE_URL setting from another integration.
    return new OpenAI({
      apiKey: directKey,
      baseURL: "https://api.openai.com/v1",
      maxRetries: 0,
      timeout: 150_000,
    });
  }

  const apiKey = env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();
  const baseURL = env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim();
  if (!apiKey || !baseURL) {
    throw new Error("Image editing is not configured. Configure OPENAI_API_KEY or the Replit OpenAI integration.");
  }
  let endpoint: URL;
  try {
    endpoint = new URL(baseURL);
  } catch {
    throw new Error("The Replit OpenAI integration endpoint is invalid.");
  }
  // Replit's managed integration can terminate HTTPS in its local sidecar.
  // Permit that exact loopback service only inside a configured Replit runtime.
  const isReplitSidecar = Boolean(env.REPL_ID?.trim()) &&
    endpoint.protocol === "http:" && endpoint.port === "1106" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if ((endpoint.protocol !== "https:" && !isReplitSidecar) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("The Replit OpenAI integration requires HTTPS or the Replit loopback sidecar endpoint, without embedded credentials, query, or fragment.");
  }
  // No retry here: another paid generation must be an explicit customer action.
  return new OpenAI({ apiKey, baseURL: endpoint.href.replace(/\/$/, ""), maxRetries: 0, timeout: 150_000 });
}
