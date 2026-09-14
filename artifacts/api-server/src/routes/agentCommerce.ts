import { Router, type IRouter, type Request, type Response } from "express";
import { getPublicArtworkBySlug } from "../catalog";
import { createAgentMpp, agentImagePriceUsd } from "../agentMpp";
import { ensureBaseObject } from "../lib/imagePipeline";
import { downloadPrivate } from "../lib/mediaStorage";
import { getTrustedPublicOrigin } from "../middlewares/trustBoundary";
import {
  fulfillAgentPayment,
  type AgentPaymentFulfillment,
} from "../commerceService";
import { refundPaymentIntent } from "../stripeClient";

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
    let fulfillment: AgentPaymentFulfillment | null = null;
    const mpp = await createAgentMpp({
      onPaymentSuccess: async (context) => {
        const requestMetadata = {
          ...(context.request?.methodDetails?.metadata ?? {}),
          ...(context.requestInput?.paymentIntentOptions?.metadata ?? {}),
        } as Record<string, string>;
        if (
          requestMetadata.artcovr_channel !== "agent_mpp" ||
          requestMetadata.artwork_id !== artwork.id ||
          requestMetadata.artwork_slug !== artwork.slug
        ) {
          throw new Error("Agent payment metadata did not match the requested artwork.");
        }

        try {
          fulfillment = await fulfillAgentPayment({
            paymentIntentId: context.receipt.reference,
            artworkId: artwork.id,
            artworkSlug: artwork.slug,
            amountCents: Number(context.request.amount),
            saleMode: artwork.saleMode!,
            currency: context.request.currency,
          });
        } catch (error) {
          if (/^pi_[A-Za-z0-9_]+$/.test(context.receipt.reference)) {
            try {
              await refundPaymentIntent(
                {
                  paymentIntentId: context.receipt.reference,
                  orderId: `order_agent_${context.receipt.reference}`,
                },
                `agent-fulfillment-failure:${context.receipt.reference}`,
              );
            } catch (refundError) {
              req.log.error(
                {
                  err: refundError,
                  paymentIntentId: context.receipt.reference,
                },
                "Agent payment fulfillment failed and automatic refund failed",
              );
            }
          }
          throw error;
        }
      },
    });
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

    const completedFulfillment = fulfillment as AgentPaymentFulfillment | null;
    if (!completedFulfillment) {
      req.log.error(
        { artworkId: artwork.id, artworkSlug: artwork.slug },
        "Agent payment completed without ARTCOVR fulfillment",
      );
      res.status(503).json({
        code: "agent_payment_unavailable",
        message: "The paid agent image is temporarily unavailable.",
      });
      return;
    }

    if (!completedFulfillment.deliver) {
      res.status(409).json({
        code: "artwork_unavailable",
        message: "That exclusive cover has already been sold.",
      });
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