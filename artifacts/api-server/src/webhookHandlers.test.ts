import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import {
  type CheckoutCatalogAuditTrigger,
  WebhookHandlers,
} from "./webhookHandlers";

function checkoutEvent(
  type: "checkout.session.completed" | "checkout.session.expired",
): Stripe.Event {
  return {
    id: `evt_${type.replaceAll(".", "_")}`,
    object: "event",
    api_version: "2025-08-27.basil",
    created: 1,
    data: {
      object: {
        id: "cs_catalog_closure",
        object: "checkout.session",
        metadata: { artwork_id: "art_catalog_closure" },
        line_items: {
          object: "list",
          data: [
            {
              id: "li_catalog_closure",
              object: "item",
              amount_discount: 0,
              amount_subtotal: 3_500,
              amount_tax: 0,
              amount_total: 3_500,
              currency: "usd",
              description: "Catalog Closure",
              discounts: [],
              price: {
                id: "price_catalog_closure",
                object: "price",
                product: "prod_catalog_closure",
              } as Stripe.Price,
              quantity: 1,
              taxes: [],
            },
          ],
          has_more: false,
          url: "/v1/checkout/sessions/cs_catalog_closure/line_items",
        },
      } as unknown as Stripe.Checkout.Session,
    },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
  };
}

for (const eventType of [
  "checkout.session.completed",
  "checkout.session.expired",
] as const) {
  test(`${eventType} invokes a read-only catalog audit with referenced objects`, async () => {
    const event = checkoutEvent(eventType);
    const calls: string[] = [];
    const auditTriggers: CheckoutCatalogAuditTrigger[] = [];

    await WebhookHandlers.processWebhook(
      Buffer.from(JSON.stringify({ id: event.id })),
      "valid_signature",
      "test_secret",
      {
        verifySignature: () => {
          calls.push("verify");
          return true;
        },
        retrieveEvent: async () => {
          calls.push("retrieve");
          return event;
        },
        fulfillSession: async () => {
          calls.push("fulfill");
        },
        scheduleCatalogAudit: (trigger) => {
          calls.push("audit");
          auditTriggers.push(trigger);
        },
      },
    );

    assert.deepEqual(calls, ["verify", "retrieve", "fulfill", "audit"]);
    assert.deepEqual(auditTriggers, [
      {
        eventId: event.id,
        eventType,
        sessionId: "cs_catalog_closure",
        artworkId: "art_catalog_closure",
        priceId: "price_catalog_closure",
        productId: "prod_catalog_closure",
      },
    ]);
  });
}

test("non-terminal Checkout events do not trigger a catalog audit", async () => {
  const event = {
    ...checkoutEvent("checkout.session.completed"),
    type: "customer.created",
  } as unknown as Stripe.Event;
  let audited = false;

  await WebhookHandlers.processWebhook(
    Buffer.from(JSON.stringify({ id: event.id })),
    "valid_signature",
    "test_secret",
    {
      verifySignature: () => true,
      retrieveEvent: async () => event,
      fulfillSession: async () => {},
      scheduleCatalogAudit: () => {
        audited = true;
      },
    },
  );

  assert.equal(audited, false);
});
