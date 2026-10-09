# Credit-card PDF analyzer (LITA server)

This endpoint analyzes **supported digital Visa bank statements** for the authenticated LTC user.

## Configuration (Vercel / LITA project)
- EDGE_STORE_ACCESS_KEY and EDGE_STORE_SECRET_KEY (optional server-only secrets; both together activate temporary Edge Store uploads)
- No Firebase Blaze plan, Cloud Storage or App Check is required for this endpoint.
- FIREBASE_PROJECT_ID (Firebase project ID that signs LTC ID tokens)
- LTC_ALLOWED_ORIGINS (optional comma-separated additional exact origins)

Keep credentials out of LTC's REACT_APP_ variables and out of Git.

## Request
POST /api/card-statements/analyze accepts multipart/form-data file field pdf, Authorization: Bearer FIREBASE_ID_TOKEN, and a restricted LTC origin. Max PDF size 4 MiB; digital documents 2–12 pages. Android providers may omit MIME or send application/octet-stream: the backend still requires the %PDF- file signature.

Identity comes ONLY from cryptographically verified Firebase JWTs (Google securetoken JWKS, signature, audience, issuer, token lifetime). No caller UID is trusted. The endpoint is separate from general chat.

## Storage and retention
The server **always parses the PDF in volatile memory**. If both Edge Store keys are configured, it also uploads to a protected, per-user bucket with temporary=true and deletes after analysis. If the keys are absent (e.g., free preview), analysis still succeeds with memory-only processing and no external file storage. If deletion of an uploaded file fails, the endpoint returns an error. Edge Store unconfirmed files expire after 24 hours per product documentation. Never save/log the object URL, raw statement or full bank-account identifiers.

## Correctness and support
The deterministic PDF.js parser requires exact **independent reconciliation per currency** with statement totals. It checks statement ARS total = purchases + prior credit + taxes. The route does not use external AI or OCR and does not invent missing data. Unknown, scanned or non-Visa layouts return 422 until separately tested.

Purchase details never count as independent LTC transactions. Taxes, previous payments/credit balances and installments are distinct concepts. ARS and USD are not converted.

## Current limits
- Three requests/user/minute soft in-memory cap; use a durable limiter or Vercel WAF for higher-volume public use.
- No Inngest dependency for synchronous statements.
- Storage deletion is verified when server credentials are configured; memory-only mode has no remote file to delete. A preview build alone is not an integration test.
- The attached personal PDF and extracted sensitive data are not committed.

## QA
Run: node --test tests/visa-statement-parser.test.mjs
CI builds Next.js and synchronizes package-lock.json on this feature branch.


## Banco Ciudad Visa Gold (newly supported)
The 2-page digital Banco Ciudad Visa Gold format uses `CIERRE ACTUAL` and `VENCIMIENTO` with Spanish month names, `dd.mm.yy` transaction dates, and `Cuota nn/nn` for installment lines. The parser extracts itemized purchases, minimum payment, closing/due dates and ARS total.

Crucially, its `DB IVA $ 21%` row lists **taxable fee base and VAT**: only the **last number is VAT**. `COM.ADM.Y LIQ.DE CUENTA` is a separate administration fee and is returned as the optional `statement.feesArs` field. The already-cleared previous statement/payment is not new spending. Both purchase subtotal and final ARS total must reconcile exactly. Nonzero Banco Ciudad USD purchases fail closed until column positions are validated with a matching source PDF.

Sample fixture is synthetic and PII-free. The customer-provided PDF, account/card details and policy identifiers are never committed.

## Common setup issue (Firebase Spark)
`AUTH_NOT_CONFIGURED` means **LITA is missing the Firebase project ID**, not that Firebase charges for the feature. On Vercel set `FIREBASE_PROJECT_ID` to the exact public project ID from LTC (`REACT_APP_PROJECT_ID`), with no wrapping quotes; deploy again so runtime picks up the variable. The server may also read `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and removes accidentally wrapping quotes. **Never remove signed-ID-token verification** to bypass configuration. The Firebase project's Auth and Firestore free quotas are independent of PDF parsing.
