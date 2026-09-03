import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export type AuthenticatedRequest = Request & {
  clerkUserId: string;
};

export const requireAuth: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({
      code: "unauthorized",
      message: "Sign in before continuing.",
    });
    return;
  }

  (req as AuthenticatedRequest).clerkUserId = userId;
  next();
};

export function getAuthenticatedUserId(req: Request) {
  return (req as AuthenticatedRequest).clerkUserId;
}

export async function getVerifiedClerkEmails(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses
    .filter((email) => email.verification?.status === "verified")
    .map((email) => email.emailAddress.trim().toLowerCase())
    .filter(Boolean);
}