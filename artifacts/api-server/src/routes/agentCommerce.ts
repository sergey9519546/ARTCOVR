import { Router, type IRouter, type Request, type Response } from "express";
import { getPublicArtworkBySlug } from "../catalog";
import { getAgentMpp, agentImagePriceUsd } from "../agentMpp";
import { ensureBaseObject } from "../lib/imagePipeline";
import { downloadPrivate } from "../lib/mediaStorage";
import { getTrustedPublicOrigin } from "../middlewares/trustBoundary";

const router: IRouter = Router();

function toWebRequest(req: Request) {
  const origin = getTrustedPublicOrigin();
  const url = new URL(req.originalUrl, origin);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  return new Request(url, {
    method: req.method,
    headers,
  });
}

async function sendWebResponse(
  webResponse: globalThis.Response,
  res: Response,
) {
  webResponse.headers.forEach((value, name) => res.setHeader(name, value));
  res.status(webResponse.status);
  res.send(Buffer.from(await webResponse.arrayBuffer()));
}

router.get("/agent/artworks/:slug/image", async (req, res): Promise<void> => {
  const slug = typeof req.params.slug === "string" ? req.params.slug : "";
  const artwork = getPublicArtworkBySlug(slug);
  if (!artwork) {
    res.status(404).json({
      code: "artwork_unavailable",
      message: "That artwork is not available through the agent image endpoint.",
    });
    return;
  }

  let price: string;
  try {
    price = agentImagePriceUsd(artwork.priceCents ?? 0);
  } catch (error) {
    req.log.error({ err: error }, "Agent image price configuration is invalid");
    res.status(503).json({
      code: "agent_payments_unavailable",
      message: "Agent image payments are temporarily unavailable.",
    });
    return;
  }

  try {
    const mpp = await getAgentMpp();
    const payment = await mpp.charge({
      amount: price,
      currency: "usd",
      description: `ARTCOVR licensed image: ${artwork.title}`,
      meta: {
        artwork_id: artwork.id,
        artwork_slug: artwork.slug,
        delivery: "licensed_original",
      },
      paymentIntentOptions: {
        metadata: {
          artcovr_channel: "agent_mpp",
          artwork_id: artwork.id,
          artwork_slug: artwork.slug,
          delivery: "licensed_original",
        },
      },
      scope: `/api/agent/artworks/${artwork.slug}/image`,
    })(toWebRequest(req));

    if (payment.status === 402) {
      await sendWebResponse(payment.challenge, res);
      return;
    }

    const objectKey = await ensureBaseObject(artwork.id, artwork.slug);
    const bytes = await downloadPrivate(objectKey);
    const response = payment.withReceipt(
      new Response(bytes, {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "image/jpeg",
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": `inline; filename="${artwork.slug}.jpg"`,
          "X-Content-Type-Options": "nosniff",
        },
      }),
    );
    await sendWebResponse(response, res);
  } catch (error) {
    req.log.error(
      { err: error, artworkId: artwork.id, artworkSlug: artwork.slug },
      "Agent image payment or delivery failed",
    );
    res.status(503).json({
      code: "agent_image_unavailable",
      message: "The paid agent image is temporarily unavailable.",
    });
  }
});

export default router;