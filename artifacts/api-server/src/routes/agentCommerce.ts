import { Router, type IRouter, type Request, type Response } from "express";
import { getPublicArtworkBySlug } from "../catalog";
import { createAgentMpp, agentImagePriceUsd } from "../agentMpp";
import { downloadBaseObject } from "../lib/imagePipeline";
import { getTrustedPublicOrigin } from "../middlewares/trustBoundary";
import {
  fulfillAgentPayment,
  type AgentPaymentFulfillment,
} from "../commerceService";
import { refundPaymentIntent } from "../stripeClient";
import { recordAgentMppEvent } from "../analyticsService";

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

function paymentFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("disabled") ||
    message.includes("configuration") ||
    message.includes("required") ||
    message.includes("invalid")
  ) {
    return "configuration_invalid" as const;
  }
  if (message.includes("stripe") || message.includes("credential")) {
    return "stripe_verification_failed" as const;
  }
  if (
    message.includes("replay") ||
    message.includes("nonce") ||
    message.includes("already used") ||
    message.includes("receipt")
  ) {
    return "replay_rejected" as const;
  }
  return "payment_or_delivery_failure" as const;
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
    recordAgentMppEvent("payment_failed", { reason: "configuration_invalid" });
    req.log.error(
      { failure: "configuration_invalid" },
      "Agent image price configuration is invalid",
    );
    res.status(503).json({
      code: "agent_payments_unavailable",
      message: "Agent image payments are temporarily unavailable.",
    });
    return;
  }

  try {
    let fulfillment: AgentPaymentFulfillment | null = null;
    let licensedOriginal: Uint8Array | null = null;
    let paymentVerified = false;
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
          recordAgentMppEvent("payment_failed", { reason: "metadata_mismatch" });
          throw new Error("Agent payment metadata did not match the requested artwork.");
        }

        paymentVerified = true;
        recordAgentMppEvent("payment_verified");
        let deliveryFailureReason = "fulfillment_failed";
        try {
          // Load the protected original only after MPP has verified payment.
          // A missing original throws here, before fulfillment can complete,
          // and the existing failure path refunds the payment.
          try {
            licensedOriginal = await downloadBaseObject(artwork.id);
          } catch (error) {
            deliveryFailureReason = "protected_media_unavailable";
            throw error;
          }
          fulfillment = await fulfillAgentPayment({
            paymentIntentId: context.receipt.reference,
            artworkId: artwork.id,
            artworkSlug: artwork.slug,
            amountCents: Number(context.request.amount),
            saleMode: artwork.saleMode!,
            currency: context.request.currency,
          });
        } catch {
          if (/^pi_[A-Za-z0-9_]+$/.test(context.receipt.reference)) {
            try {
              await refundPaymentIntent(
                {
                  paymentIntentId: context.receipt.reference,
                  orderId: `order_agent_${context.receipt.reference}`,
                },
                `agent-fulfillment-failure:${context.receipt.reference}`,
              );
              recordAgentMppEvent("refund_completed");
            } catch (refundError) {
              recordAgentMppEvent("refund_pending", {
                reason: "automatic_refund_failed",
              });
              req.log.error(
                {
                  failure: "automatic_refund_failed",
                },
                "Agent payment fulfillment failed and automatic refund failed",
              );
            }
          }
          recordAgentMppEvent("delivery_failed", {
            reason: deliveryFailureReason,
          });
          throw new Error("Agent image delivery failed after payment verification.");
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
      recordAgentMppEvent("challenge_issued");
      await sendWebResponse(payment.challenge, res);
      return;
    }

    const completedFulfillment = fulfillment as AgentPaymentFulfillment | null;
    if (!completedFulfillment) {
      req.log.error(
        { failure: "fulfillment_missing" },
        "Agent payment completed without ARTCOVR fulfillment",
      );
      recordAgentMppEvent("delivery_failed", { reason: "fulfillment_missing" });
      res.status(503).json({
        code: "agent_payment_unavailable",
        message: "The paid agent image is temporarily unavailable.",
      });
      return;
    }

    if (!completedFulfillment.deliver) {
      recordAgentMppEvent("delivery_failed", { reason: "exclusive_conflict" });
      res.status(409).json({
        code: "artwork_unavailable",
        message: "That exclusive cover has already been sold.",
      });
      return;
    }

    const bytes = licensedOriginal as Uint8Array | null;
    if (!bytes) {
      throw new Error("The protected artwork original was not loaded.");
    }
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
    recordAgentMppEvent("delivery_succeeded");
  } catch (error) {
    const reason = paymentFailureReason(error);
    if (reason === "replay_rejected") {
      recordAgentMppEvent("replay_rejected");
    } else if (!/delivery failed after payment verification/i.test(
      error instanceof Error ? error.message : "",
    )) {
      recordAgentMppEvent("payment_failed", { reason });
    }
    req.log.error({ failure: reason }, "Agent image payment or delivery failed");
    res.status(503).json({
      code: "agent_image_unavailable",
      message: "The paid agent image is temporarily unavailable.",
    });
  }
});

export default router;