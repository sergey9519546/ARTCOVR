import express, { Router, type IRouter, type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { artcovrInquiries, artcovrReferenceUploads, db } from "@workspace/db";
import { getPublicArtworkById } from "../catalog";
import { getVerifiedClerkEmails, getAuthenticatedUserId, requireAuth } from "../middlewares/auth";
import { admitGeneration, generationStatus, runGeneration, GenerationServiceError } from "../generationService";
import { acceptedImageTypes, inspectReference, maxReferenceBytes } from "../lib/imagePipeline";
import { removePrivate, uploadPrivate } from "../lib/mediaStorage";

const router: IRouter = Router();
const generationBody = z.object({
  artworkId: z.string().trim().min(1).max(200),
  prompt: z.string().min(1).max(12_000),
  purchaseId: z.string().trim().min(1).max(200).nullable().optional(),
  referenceGenerationId: z.string().trim().min(1).max(200).nullable().optional(),
  referenceUploadId: z.string().trim().min(1).max(200).nullable().optional(),
  coverText: z.object({ title: z.string().max(120).nullable().optional(), artistName: z.string().max(120).nullable().optional() }).nullable().optional(),
  styleMode: z.enum(["exact", "expand"]).nullable().optional(),
  resetToBase: z.boolean().optional(),
});

function sendError(res: Response, error: unknown) {
  if (error instanceof GenerationServiceError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  if (error instanceof Error && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    res.status(400).json({ code: (error as { code: string }).code, message: error.message });
    return;
  }
  res.status(502).json({ code: "service_unavailable", message: "The customer service is temporarily unavailable." });
}

router.post(
  "/functions/v1/upload-reference",
  requireAuth,
  express.raw({ type: [...acceptedImageTypes], limit: maxReferenceBytes + 1 }),
  async (req, res): Promise<void> => {
    const userId = getAuthenticatedUserId(req);
    const artworkId = String(req.query.artworkId ?? "").trim();
    if (!artworkId || artworkId.length > 200 || !getPublicArtworkById(artworkId)) {
      res.status(400).json({ code: "invalid_request", message: "artworkId is required." });
      return;
    }
    const contentType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!acceptedImageTypes.has(contentType)) {
      res.status(415).json({ code: "unsupported_media_type", message: "Upload a JPEG, PNG or WebP image." });
      return;
    }
    const bytes = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
    if (bytes.length > maxReferenceBytes) {
      res.status(413).json({ code: "reference_too_large", message: "Reference images must be 8 MB or smaller." });
      return;
    }
    const id = randomUUID();
    const objectKey = `reference-uploads/${userId}/${id}.webp`;
    try {
      const normalized = await inspectReference(bytes, contentType);
      await db.insert(artcovrReferenceUploads).values({
        id, clerkUserId: userId, artworkId, objectKey,
        sha256: normalized.sha256, width: normalized.width, height: normalized.height,
        bytes: normalized.bytes.length, expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      });
      await uploadPrivate(objectKey, normalized.bytes, "image/webp");
      await db.update(artcovrReferenceUploads).set({ uploadedAt: new Date() }).where(eq(artcovrReferenceUploads.id, id));
      res.status(201).set("Cache-Control", "private, no-store").json({ referenceUploadId: id });
    } catch (error) {
      await removePrivate([objectKey]).catch(() => undefined);
      await db.delete(artcovrReferenceUploads).where(eq(artcovrReferenceUploads.id, id)).catch(() => undefined);
      sendError(res, error);
    }
  },
);

router.post("/functions/v1/generate-image", requireAuth, async (req, res): Promise<void> => {
  const parsed = generationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: "invalid_request", message: "artworkId and prompt are required." });
    return;
  }
  try {
    const job = await admitGeneration({ ...parsed.data, userId: getAuthenticatedUserId(req) });
    void runGeneration(job, getAuthenticatedUserId(req));
    res.status(202).set("Cache-Control", "private, no-store").json({
      generationId: job.id,
      status: "running",
      statusUrl: `/functions/v1/generation-status?generationId=${encodeURIComponent(job.id)}`,
    });
  } catch (error) {
    sendError(res, error);
  }
});

async function statusHandler(req: express.Request, res: Response): Promise<void> {
  const id = String(req.query.generationId ?? req.body?.generationId ?? "").trim();
  if (!id) {
    res.status(400).json({ code: "invalid_request", message: "generationId is required." });
    return;
  }
  try {
    res.set("Cache-Control", "private, no-store").json(await generationStatus(id, getAuthenticatedUserId(req)));
  } catch (error) {
    sendError(res, error);
  }
}

router.get("/functions/v1/generation-status", requireAuth, statusHandler);
router.post("/functions/v1/generation-status", requireAuth, statusHandler);

router.post("/functions/v1/submit-inquiry", requireAuth, async (req, res): Promise<void> => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!message || message.length > 5000) {
    res.status(400).json({ code: "invalid_message", message: "Message must contain 1–5000 characters." });
    return;
  }
  try {
    const userId = getAuthenticatedUserId(req);
    const emails = await getVerifiedClerkEmails(userId);
    const email = emails[0];
    if (!email) {
      res.status(400).json({ code: "missing_email", message: "Your account needs a verified email address." });
      return;
    }
    const since = new Date(Date.now() - 60 * 60_000);
    const recent = await db.select({ id: artcovrInquiries.id }).from(artcovrInquiries).where(and(eq(artcovrInquiries.clerkUserId, userId), gte(artcovrInquiries.createdAt, since)));
    if (recent.length >= 5) {
      res.status(429).json({ code: "inquiry_rate_limited", message: "Too many inquiries in the last hour. Try again later." });
      return;
    }
    const id = randomUUID();
    const createdAt = new Date();
    await db.insert(artcovrInquiries).values({ id, clerkUserId: userId, email, name: name || null, message, createdAt });
    res.status(201).json({ inquiryId: id, createdAt: createdAt.toISOString() });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;