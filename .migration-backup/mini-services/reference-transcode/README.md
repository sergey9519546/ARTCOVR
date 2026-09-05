# reference-transcode

The re-encoder `supabase/functions/upload-reference` requires. Bytes in,
bounded WebP out; the exact request/response contract lives in
`supabase/functions/upload-reference/transcode.ts` and this service implements
it verbatim.

Why it exists: the Supabase edge runtime has no image codec, and client bytes
must never be stored raw (EXIF, colour profiles and exotic containers all die
here). A missing re-encoder is a hard 500 upstream by design.

## Run

```bash
bun install
TRANSCODE_TOKEN=<long-random-secret> PORT=8791 bun run start
```

Then set on the Supabase project:

```
REFERENCE_TRANSCODE_URL=https://<your-host>/
REFERENCE_TRANSCODE_TOKEN=<the same secret>
```

`bun run smoke` starts nothing external: it spins the server on an ephemeral
port, generates test images in memory, and asserts the contract (auth required,
downscale to the bound, EXIF orientation honoured, animated/undecodable/oversize
rejected).

sharp is the only dependency — a deliberate exception to the no-new-deps rule,
contained to this service: the repo has no raster codec anywhere else, and the
alternative (hand-rolled decoding) is exactly the attack surface this service
exists to remove.
