/**
 * Static preview server for the `output: "export"` build.
 *
 * `next start` cannot serve this project: with `output: "export"` Next.js emits
 * a plain static site under out/ and refuses to boot its production server. No
 * static-file server is installed in node_modules, so rather than take on a new
 * dependency this serves out/ from the Node standard library.
 *
 * Routing mirrors the vercel.json contract so the preview matches production:
 *   cleanUrls: true      -> /about resolves to out/about.html
 *   trailingSlash: false -> /about/ is redirected to /about
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const exportRoot = path.resolve(import.meta.dirname, "..", "next-build");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

/** Resolve a candidate path, returning it only if it is a real file inside out/. */
const resolveFile = async (candidate: string): Promise<string | null> => {
  const resolved = path.resolve(exportRoot, candidate);
  // Containment check: never serve anything outside the export root.
  if (resolved !== exportRoot && !resolved.startsWith(exportRoot + path.sep)) {
    return null;
  }
  const stats = await stat(resolved).catch(() => null);
  return stats?.isFile() ? resolved : null;
};

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method Not Allowed");
    return;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(
      new URL(request.url ?? "/", `http://${host}:${port}`).pathname,
    );
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain" }).end("Bad Request");
    return;
  }
  if (pathname.includes("\0")) {
    response.writeHead(400, { "Content-Type": "text/plain" }).end("Bad Request");
    return;
  }

  // trailingSlash: false — normalize /about/ to /about before resolving.
  if (pathname.length > 1 && pathname.endsWith("/")) {
    response.writeHead(308, { Location: pathname.replace(/\/+$/, "") }).end();
    return;
  }

  const relative = pathname.replace(/^\/+/, "");
  const candidates =
    relative === ""
      ? ["index.html"]
      : [relative, `${relative}.html`, path.join(relative, "index.html")];

  let filePath: string | null = null;
  for (const candidate of candidates) {
    filePath = await resolveFile(candidate);
    if (filePath) break;
  }

  let status = 200;
  if (!filePath) {
    status = 404;
    filePath = await resolveFile("404.html");
    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain" }).end("Not Found");
      return;
    }
  }

  const contentType =
    contentTypes.get(path.extname(filePath).toLowerCase()) ??
    "application/octet-stream";
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  if (method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

const exportRootExists = await stat(exportRoot)
  .then((stats) => stats.isDirectory())
  .catch(() => false);
if (!exportRootExists) {
  console.error(
    `No static export found at ${exportRoot}. Run \`bun run build\` first.`,
  );
  process.exit(1);
}

server.listen(port, host, () => {
  console.log(`Serving static export from ${exportRoot}`);
  console.log(`http://${host}:${port}`);
});
