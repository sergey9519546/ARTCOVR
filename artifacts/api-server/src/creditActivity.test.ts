import assert from "node:assert/strict";
import test from "node:test";
import { listUserCreditActivity } from "./creditService";

test("credit activity is purchase-scoped and omits internal ledger fields", async () => {
  const rows = [
    {
      id: "ledger-1",
      purchaseId: "purchase-1",
      entryType: "grant",
      amount: 4,
      reason: "Cover purchase credit grant",
      occurredAt: new Date("2026-09-05T12:00:00.000Z"),
    },
    {
      id: "ledger-2",
      purchaseId: "purchase-1",
      entryType: "spend",
      amount: -1,
      reason: "Image generation credit spend",
      occurredAt: new Date("2026-09-05T12:01:00.000Z"),
    },
    {
      id: "ledger-3",
      purchaseId: "purchase-1",
      entryType: "revoke",
      amount: -3,
      reason: "Purchase refunded",
      occurredAt: new Date("2026-09-05T12:02:00.000Z"),
    },
  ];
  const select = () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  });

  const activity = await listUserCreditActivity(
    { select } as never,
    "user-1",
  );

  assert.deepEqual(activity, {
    activities: [
    {
      purchaseId: "purchase-1",
      event: "grant",
      label: "Credits added",
      amount: 4,
      occurredAt: new Date("2026-09-05T12:00:00.000Z"),
    },
    {
      purchaseId: "purchase-1",
      event: "generation",
      label: "Generation used",
      amount: -1,
      occurredAt: new Date("2026-09-05T12:01:00.000Z"),
    },
    {
      purchaseId: "purchase-1",
      event: "refund",
      label: "Refund adjustment",
      amount: -3,
      occurredAt: new Date("2026-09-05T12:02:00.000Z"),
    },
    ],
    nextCursor: null,
  });
  assert.equal("reason" in activity.activities[0], false);
  assert.equal("sourceId" in activity.activities[0], false);
});

test("credit activity returns a bounded page and an opaque cursor", async () => {
  const rows = Array.from({ length: 26 }, (_, index) => ({
    id: `ledger-${index}`,
    purchaseId: "purchase-1",
    entryType: "spend",
    amount: -1,
    reason: "Image generation credit spend",
    occurredAt: new Date(
      Date.parse("2026-09-05T12:00:00.000Z") + index * 1_000,
    ),
  }));
  const select = () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  });

  const page = await listUserCreditActivity(
    { select } as never,
    "user-1",
  );

  assert.equal(page.activities.length, 25);
  assert.equal(page.activities[0].event, "generation");
  assert.equal(typeof page.nextCursor, "string");
  assert.ok(page.nextCursor);
  assert.equal("id" in page.activities[0], false);
});