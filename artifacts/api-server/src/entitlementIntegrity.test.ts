import assert from "node:assert/strict";
import test from "node:test";
import { isSelectedPreviewForOrder } from "./generationService";

const preview = {
  id: "generation-preview",
  artworkId: "artwork-a",
  clerkUserId: "user-a",
  purchaseId: null,
  phase: "preview" as const,
  status: "succeeded",
};

const order = {
  artworkId: "artwork-a",
  clerkUserId: "user-a",
  selectedPreviewId: preview.id,
};

test("selected previews must belong to the same buyer and artwork", () => {
  assert.equal(isSelectedPreviewForOrder(preview, order), true);
  assert.equal(
    isSelectedPreviewForOrder(preview, { ...order, artworkId: "artwork-b" }),
    false,
  );
  assert.equal(
    isSelectedPreviewForOrder(preview, { ...order, clerkUserId: "user-b" }),
    false,
  );
});

test("purchased or incomplete generations cannot become selected previews", () => {
  assert.equal(
    isSelectedPreviewForOrder(
      { ...preview, phase: "purchased", purchaseId: "old-order" },
      order,
    ),
    false,
  );
  assert.equal(
    isSelectedPreviewForOrder({ ...preview, status: "failed" }, order),
    false,
  );
  assert.equal(
    isSelectedPreviewForOrder({ ...preview, id: "another-generation" }, order),
    false,
  );
});