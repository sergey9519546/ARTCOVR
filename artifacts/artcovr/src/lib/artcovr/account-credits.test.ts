import assert from "node:assert/strict";
import test from "node:test";
import { accountCreditBalance, purchaseCreditBalance } from "./account-credits";

test("explicit credit balances including zero override legacy allowances", () => {
  assert.equal(purchaseCreditBalance({ remainingCredits: 0, remainingGenerations: 5 }), 0);
  assert.equal(purchaseCreditBalance({ remainingCredits: 3, remainingGenerations: 5 }), 3);
});

test("only an absent credit balance uses the legacy allowance", () => {
  assert.equal(purchaseCreditBalance({ remainingGenerations: 2 }), 2);
  assert.equal(purchaseCreditBalance({ remainingCredits: undefined, remainingGenerations: 2 }), 2);
  assert.equal(purchaseCreditBalance({}), 0);
});

test("invalid balances fail closed without reverting to legacy credits", () => {
  for (const value of [null, -1, 0.5, NaN, Infinity, "3", true, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(purchaseCreditBalance({ remainingCredits: value, remainingGenerations: 5 }), 0);
    assert.equal(purchaseCreditBalance({ remainingGenerations: value }), 0);
  }
});

test("an absent account total sums current and legacy purchase balances", () => {
  assert.equal(accountCreditBalance({ purchases: [
    { remainingCredits: 3, remainingGenerations: 8 },
    { remainingGenerations: 2 },
    { remainingCredits: 0, remainingGenerations: 9 },
  ] }), 5);
  assert.equal(accountCreditBalance({ purchases: [] }), 0);
});

test("explicit account totals are authoritative, including zero and invalid values", () => {
  const purchases = [{ remainingGenerations: 5 }];
  assert.equal(accountCreditBalance({ totalCreditBalance: 0, purchases }), 0);
  assert.equal(accountCreditBalance({ totalCreditBalance: 7, purchases }), 7);
  for (const totalCreditBalance of [null, -1, 0.5, NaN, Infinity, "3", Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(accountCreditBalance({ totalCreditBalance, purchases }), 0);
  }
});

test("overflowing fallback totals fail closed", () => {
  assert.equal(accountCreditBalance({ purchases: [
    { remainingCredits: Number.MAX_SAFE_INTEGER }, { remainingCredits: 1 },
  ] }), 0);
});
