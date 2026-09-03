import { Storage } from "@google-cloud/storage";

const sidecar = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${sidecar}/token`,
    type: "external_account",
    credential_source: { url: `${sidecar}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parsePath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) throw new Error("Invalid private object path.");
  return { bucket: parts[1], name: parts.slice(2).join("/") };
}

function privateDir() {
  const dir = process.env.PRIVATE_OBJECT_DIR?.replace(/\/$/, "");
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
  return dir;
}

export function privateObjectPath(key: string) {
  return `${privateDir()}/${key}`.replace(/\/+/g, "/");
}

async function signedUrl(path: string, method: "GET" | "PUT" | "DELETE", ttlSeconds: number) {
  const { bucket, name } = parsePath(path);
  const response = await fetch(`${sidecar}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: name,
      method,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Object storage signing failed (${response.status}).`);
  const body = (await response.json()) as { signed_url?: string };
  if (!body.signed_url) throw new Error("Object storage returned no signed URL.");
  return body.signed_url;
}

export async function uploadPrivate(key: string, bytes: Uint8Array, contentType: string) {
  const path = privateObjectPath(key);
  const { bucket, name } = parsePath(path);
  await storage.bucket(bucket).file(name).save(Buffer.from(bytes), {
    resumable: false,
    contentType,
    metadata: { cacheControl: "private, no-store" },
  });
  return path;
}

export async function downloadPrivate(key: string) {
  const path = privateObjectPath(key);
  const { bucket, name } = parsePath(path);
  const [bytes] = await storage.bucket(bucket).file(name).download();
  return new Uint8Array(bytes);
}

export async function removePrivate(keys: string[]) {
  await Promise.all(keys.map(async (key) => {
    const path = privateObjectPath(key);
    const { bucket, name } = parsePath(path);
    await storage.bucket(bucket).file(name).delete({ ignoreNotFound: true });
  }));
}

export function signPrivate(key: string, ttlSeconds = 300) {
  return signedUrl(privateObjectPath(key), "GET", ttlSeconds);
}