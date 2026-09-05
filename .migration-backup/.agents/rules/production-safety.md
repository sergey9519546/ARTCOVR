# PRODUCTION SAFETY RULES

1. **Zero Secret Leakage**: Never commit API keys, service role secrets, Stripe private keys, or credentials.
2. **Deterministic Settlements**: Checkout and payment flows must enforce idempotency, locking, and atomic settlement.
3. **Data Integrity**: Never execute unverified migrations or destructive schema operations without backup and transaction rollback safety.
4. **Clean Asset Protection**: Clean high-resolution master images reside exclusively in private storage and are delivered only via signed URLs scoped to valid, unrevoked purchases.
