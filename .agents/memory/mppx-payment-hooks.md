---
name: MPP payment hook placement
description: mppx server success callbacks must be attached to the configured method descriptor and are awaited on the payment path.
---

Attach payment success work to the configured method returned by the rail factory before passing it to `Mppx.create`; mppx registers that method hook and awaits it inline before completing the protected response. Failure notifications are separate MPP event handlers and should not be confused with Stripe payment-failure webhooks.

**Why:** The mppx server API exposes method-level `onPaymentSuccess`, while `Mppx.create` only registers that property from each method descriptor. Putting the callback on the Mppx config or treating a failure observer as entitlement state can leave a successful payment unfulfilled.

**How to apply:** When adding MPP commerce, use a request-scoped method descriptor for request-specific fulfillment and keep durable release/revocation in the Stripe webhook lifecycle.