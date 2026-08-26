/**
 * Contract smoke test. Spawns the real server as a subprocess on a test port,
 * synthesises inputs with sharp, and asserts every branch of the documented
 * contract. Run: `bun run smoke` (exit 0 = pass).
 */
import sharp from "sharp";

const PORT = 8799;
const TOKEN = "smoke-secret";
const BASE = `http://127.0.0.1:${PORT}/`;

const server = Bun.spawn(["bun", "run", "index.ts"], {
  cwd: import.meta.dir,
  env: { ...process.env, TRANSCODE_TOKEN: TOKEN, PORT: String(PORT) },
  stdout: "pipe",
  stderr: "pipe",
});

async function waitReady(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const res = await fetch(BASE, { method: "GET" });
      if (res.status === 405) return; // server answers: GET is method_not_allowed
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not come up");
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function post(body: Uint8Array | ArrayBuffer, headers: Record<string, string>) {
  return fetch(BASE, { method: "POST", headers, body });
}

try {
  await waitReady();

  const png = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .png()
    .toBuffer();

  // 1. auth required
  const noAuth = await post(png, { "content-type": "image/png" });
  check("missing token -> 401", noAuth.status === 401);

  const auth = { authorization: `Bearer ${TOKEN}` };

  // 2. happy path: downscaled to the bound, webp out, aspect preserved
  const ok = await post(png, { ...auth, "content-type": "image/png", "x-max-long-side": "1024", "x-output-format": "webp" });
  check("valid png -> 200", ok.status === 200);
  check("output is webp", (ok.headers.get("content-type") ?? "") === "image/webp");
  const outMeta = await sharp(Buffer.from(await ok.arrayBuffer())).metadata();
  check("long side bounded", outMeta.width === 1024, `${outMeta.width}x${outMeta.height}`);
  check("aspect preserved", outMeta.height === 512, `${outMeta.width}x${outMeta.height}`);
  check("no metadata carried", !outMeta.exif && !outMeta.icc);

  // 3. small image is not enlarged
  const small = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#222" } }).jpeg().toBuffer();
  const smallRes = await post(small, { ...auth, "content-type": "image/jpeg", "x-max-long-side": "1024" });
  const smallMeta = await sharp(Buffer.from(await smallRes.arrayBuffer())).metadata();
  check("no enlargement", smallRes.status === 200 && smallMeta.width === 300);

  // 4. EXIF orientation honoured before metadata dies
  const rotated = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#333" } })
    .jpeg()
    .withMetadata({ orientation: 6 }) // 90° CW: display size is 400x800
    .toBuffer();
  const rotRes = await post(rotated, { ...auth, "content-type": "image/jpeg", "x-max-long-side": "1024" });
  const rotMeta = await sharp(Buffer.from(await rotRes.arrayBuffer())).metadata();
  check("EXIF orientation applied", rotMeta.width === 400 && rotMeta.height === 800, `${rotMeta.width}x${rotMeta.height}`);

  // 5. animated input rejected (2-frame webp via sharp's join)
  const frameA = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#a00" } }).png().toBuffer();
  const frameB = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#00a" } }).png().toBuffer();
  let animatedProbeDone = false;
  try {
    const joined = await (sharp as unknown as (input?: unknown, opts?: unknown) => sharp.Sharp)(
      [frameA, frameB] as unknown as undefined,
      { join: { animated: true } } as unknown as undefined,
    )
      .webp({ loop: 0 })
      .toBuffer();
    const animRes = await post(joined, { ...auth, "content-type": "image/webp", "x-max-long-side": "1024" });
    check("animated webp -> 422", animRes.status === 422, String(animRes.status));
    animatedProbeDone = true;
  } catch {
    /* this sharp build cannot join frames */
  }
  if (!animatedProbeDone) console.log("skip animated-webp probe (sharp build lacks join)");

  // 6. garbage rejected
  const junk = await post(new TextEncoder().encode("not an image at all"), { ...auth, "content-type": "image/png" });
  check("undecodable -> 422", junk.status === 422);

  // 7. wrong content type rejected before decode
  const gifTyped = await post(png, { ...auth, "content-type": "image/gif" });
  check("image/gif -> 415", gifTyped.status === 415);

  // 8. bad bound rejected
  const badBound = await post(png, { ...auth, "content-type": "image/png", "x-max-long-side": "99999" });
  check("out-of-range bound -> 400", badBound.status === 400);
} finally {
  server.kill();
}

if (failures > 0) {
  console.error(`\n${failures} contract check(s) FAILED`);
  process.exit(1);
}
console.log("\nall contract checks passed");
