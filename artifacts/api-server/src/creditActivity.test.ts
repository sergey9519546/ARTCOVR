import assert from "node:assert/strict";
import test from "node:test";
import { listUserCreditActivity } from "./creditService";

test("credit activity is purchase-scoped and omits internal ledger fields", async () => {
  const select = () => ({
    from: () => ({
      where: () => ({
        orderBy: async () => [
          {
            purchaseId: "purchase-1",
            entryType: "grant",
            amount: 4,
            reason: "Cover purchase credit grant",
            occurredAt: new Date("2026-09-05T12:00:00.000Z"),
          },
          {
            purchaseId: "purchase-1",
            entryType: "spend",
            amount: -1,
            reason: "Image generation credit spend",
            occurredAt: new Date("2026-09-05T12:01:00.000Z"),
          },
          {
            purchaseId: "purchase-1",
            entryType: "revoke",
            amount: -3,
            reason: "Purchase refunded",
            occurredAt: new Date("2026-09-05T12:02:00.000Z"),
          },
        ],
      }),
    }),
  });

  const activity = await listUserCreditActivity(
    { select } as never,
    "user-1",
  );

  assert.deepEqual(activity, [
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
  ]);
  assert.equal("reason" in activity[0], false);
  assert.equal("sourceId" in activity[0], false);
});