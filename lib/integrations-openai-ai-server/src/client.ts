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
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("The Replit OpenAI integration requires an HTTPS endpoint without embedded credentials, query, or fragment.");
  }
  // No retry here: another paid generation must be an explicit customer action.
  return new OpenAI({ apiKey, baseURL: endpoint.href.replace(/\/$/, ""), maxRetries: 0, timeout: 150_000 });
}
