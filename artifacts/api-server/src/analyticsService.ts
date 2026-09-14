import { logger } from "./lib/logger";

export const agentMppOperationalEvents = [
  "challenge_issued",
  "payment_verified",
  "payment_failed",
  "replay_rejected",
  "delivery_succeeded",
  "delivery_failed",
  "refund_completed",
  "refund_pending",
] as const;

export type AgentMppOperationalEvent =
  (typeof agentMppOperationalEvents)[number];

type EventDetails = {
  reason?: string;
};

const counts = new Map<AgentMppOperationalEvent, number>();
let lastEventAt: string | null = null;
let pendingRefunds = 0;

export function recordAgentMppEvent(
  event: AgentMppOperationalEvent,
  details: EventDetails = {},
) {
  counts.set(event, (counts.get(event) ?? 0) + 1);
  if (event === "refund_pending") pendingRefunds += 1;
  if (event === "refund_completed" && pendingRefunds > 0) {
    pendingRefunds -= 1;
  }
  lastEventAt = new Date().toISOString();

  // Keep this event aggregate-only. Never attach payer, payment-provider,
  // object-storage, signed-URL, or raw exception data to operational logs.
  logger.info(
    {
      operationalEvent: "agent_mpp",
      outcome: event,
      reason: details.reason,
    },
    "Agent MPP operational event",
  );
}

export function getAgentMppOperationalSummary() {
  return {
    counts: Object.fromEntries(
      agentMppOperationalEvents.map((event) => [event, counts.get(event) ?? 0]),
    ) as Record<AgentMppOperationalEvent, number>,
    pendingRefunds,
    lastEventAt,
  };
}