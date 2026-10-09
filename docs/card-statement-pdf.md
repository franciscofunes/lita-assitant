# Credit-card PDF analyzer (LITA server)

This endpoint analyzes **supported digital Visa bank statements** for the authenticated LTC user.

## Configuration (Vercel / LITA project)
- EDGE_STORE_ACCESS_KEY (server secret)
- EDGE_STORE_SECRET_KEY (server secret)
- FIREBASE_PROJECT_ID (Firebase project ID that signs LTC ID tokens)
- LTC_ALLOWED_ORIGINS (optional comma-separated additional exact origins)

Keep credentials out of LTC's REACT_APP_ variables and out of Git.

## Request
POST /api/card-statements/analyze accepts multipart/form-data file field pdf, Authorization: Bearer FIREBASE_ID_TOKEN, and a restricted LTC origin. Max PDF size 4 MiB; digital documents 2–12 pages.

Identity comes ONLY from cryptographically verified Firebase JWTs (Google securetoken JWKS, signature, audience, issuer, token lifetime). No caller UID is trusted. The endpoint is separate from general chat.

## Storage and retention
The server uploads to a protected, per-user Edge Store bucket with temporary=true. The file is processed in memory; deletion is attempted in finally, and a deletion failure returns an error. Edge Store unconfirmed files expire after 24 hours per product documentation. Never save/log the object URL, raw statement or full bank-account identifiers.

## Correctness and support
The deterministic PDF.js parser requires exact **independent reconciliation per currency** with statement totals. It checks statement ARS total = purchases + prior credit + taxes. The route does not use external AI or OCR and does not invent missing data. Unknown, scanned or non-Visa layouts return 422 until separately tested.

Purchase details never count as independent LTC transactions. Taxes, previous payments/credit balances and installments are distinct concepts. ARS and USD are not converted.

## Current limits
- Three requests/user/minute soft in-memory cap; use a durable limiter or Vercel WAF for higher-volume public use.
- No Inngest dependency for synchronous statements.
- Storage deletion is only verified when server credentials are configured; a preview build alone is not an integration test.
- The attached personal PDF and extracted sensitive data are not committed.

## QA
Run: node --test tests/visa-statement-parser.test.mjs
CI builds Next.js and synchronizes package-lock.json on this feature branch.
