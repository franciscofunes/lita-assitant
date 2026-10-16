# Lita — development, verification and operations

[README](../README.md) · [Architecture](architecture.md) · [AI providers](ai-providers.md) · [Digital statement parser](card-statement-pdf.md)

## Local setup

Use **Node.js 24.x** (`package.json`) and npm. Lita is a Next.js application; the LTC host assumes the Lita local iframe is available on **port 3005**.

~~~bash
git clone https://github.com/franciscofunes/lita-assitant.git
cd lita-assitant
npm ci
cp .env.example .env.local
# Configure an eligible provider model and its server-side credentials.
npm run dev -- -p 3005
~~~

Run LTC separately on `http://localhost:3000` and confirm `NEXT_PUBLIC_LITA_PARENT_ORIGINS` allows it. Next.js loads `.env.local` automatically; **never commit it**.

## Environment variable map

| Variable(s) | Required when | What it controls |
| --- | --- | --- |
| `AI_GATEWAY_MODEL`, optional `AI_GATEWAY_API_KEY` | Using Vercel AI Gateway | Model ID; server-side API key or Vercel OIDC runtime token |
| `GROQ_API_KEY` / `GROQ_MODEL` | Using Groq | OpenAI-compatible provider |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Using OpenRouter | Optional referer/app-name headers |
| `NVIDIA_API_KEY` / `NVIDIA_MODEL` | Using NVIDIA NIM | Additional provider |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Using Google AI Studio | OpenAI-compatible Gemini endpoint |
| `AI_PROVIDER_STRATEGY` / `AI_PROVIDER_ORDER` | Customizing routing | `ordered` or warm-instance `round-robin`, preferred attempts |
| `AI_GATEWAY_FALLBACK_MODELS` | Gateway model fallback | Comma-separated additional Gateway models |
| `AI_PROVIDER_TIMEOUT_MS` | Request tuning | Timeout per attempt |
| `LITA_MAX_HISTORY_MESSAGES` / `LITA_MAX_CONTEXT_CHARS` / `LITA_MAX_OUTPUT_TOKENS` | Budget controls | Bound messages, financial context and generated output |
| `NEXT_PUBLIC_LITA_PARENT_ORIGINS` | Embedding outside the default allowlist | Trusted LTC parent origins (comma-separated) |
| `FIREBASE_PROJECT_ID` | PDF analysis | Must equal LTC's `REACT_APP_PROJECT_ID`; public project ID, not an admin credential |
| `LTC_ALLOWED_ORIGINS` | Additional PDF callers | Exact allowed browser Origin values |
| `STATEMENT_PDF_EDGE_STORE_ENABLED` | Optional temporary upload | **False by default**; leave off for memory-only parsing |
| `EDGE_STORE_ACCESS_KEY` / `EDGE_STORE_SECRET_KEY` | Opted-in storage | Strictly server-side; neither is required in default memory-only mode |

The legacy `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` and `AI_FALLBACK_*` pairs remain supported in the router. At least one complete provider model+credential/auth configuration is required for chat readiness. Free tiers and model availability are external and can change at any time.

## Tests and quality checks

~~~bash
# Financial scope, contextual follow-ups, and transaction wizard
node --test tests/finance-scope.test.mjs tests/financial-conversation.test.mjs tests/transaction-wizard.test.mjs

# Synthetic card PDFs and PDF.js worker smoke
node --test tests/visa-statement-parser.test.mjs tests/pdfjs-worker-smoke.test.cjs

# Static checks and production build
npm run lint
npm run build
~~~

The GitHub workflows `financial-scope.yml` and `statement-pdf.yml` cover the sensitive server-contract paths. Their path filters mean **a docs-only PR may not trigger those workflows**, so explicitly run/verify checks when changing runtime behavior. Do not use real card statements as committed test fixtures: keep them synthetic and free of personal identifiers.

## Production deployment

~~~mermaid
flowchart TD
    PR["PR / feature branch"] --> CI["Run relevant Node tests + Next build"]
    CI --> Preview["Vercel preview deployment"]
    Preview --> Check["Validate embedded origin and API smoke checks"]
    Check --> Merge["Merge into main"]
    Merge --> Production["Verify production deployment commit and domain"]
    Production --> Smoke["Check /api/status and PDF token path"]
~~~

- **Vercel** hosts Lita. Verify the deployment is **Production**, not merely a successful Preview. Confirm that the domain used by LTC (`https://holalita.vercel.app/`) is routed to the intended production deployment.
- Set environment variables for the correct Vercel environment (Preview vs Production). Changing variables often requires a new deployment.
- `GET /api/status` is safe to expose: it reports configuration metadata but not credentials. `ready: true` does not prove a live AI completion succeeds.
- For the PDF path, ensure `FIREBASE_PROJECT_ID` matches the LTC Firebase project. Wrong project ID causes authentication failure even when both applications build.
- The LTC browser must use the matching allowed origin. Never disable or relax PDF token verification merely to unblock a failed request.
- All **Firestore security rules and data persistence belong to LTC/Firebase**. This repository does not deploy those rules.

## Security design and incident response

1. **Chat is not an authenticated finance-write API.** `/api/chat` takes bounded context from an untrusted client, enforces financial scope and screens the final answer. It does not verify Firebase JWTs in the present code. Keep it read-only and limit sensitive context sent to providers.
2. **PDF analysis is token-protected.** It validates Google-signed Firebase ID tokens (JWKS), allowed Origin, PDF signature, size and parsability. Authenticated UID is derived from the token only.
3. **Storage is default-deny.** No upload to third-party object storage when `STATEMENT_PDF_EDGE_STORE_ENABLED=false`. If explicitly enabled, use a protected per-user bucket and verify cleanup. No external LLM receives raw PDF bytes.
4. **Logs should not contain financial content.** For the PDF path, inspect structured stage/error codes rather than logging user IDs, files, tokens or purchase amounts. Guard provider error-response logging against sensitive content during incident triage.
5. **Provider contracts vary.** Review training/retention and quotas when enabling new provider endpoints. Do not assume OpenAI compatibility implies equivalent security.
6. **Limits are instance-local.** In-memory counters and round-robin cursors are not globally coordinated across Vercel serverless replicas.

## Troubleshooting matrix

| Error or symptom | Likely first checks |
| --- | --- |
| Chat reports no providers | `AI_GATEWAY_MODEL`/provider keys in the **deployed** environment; `/api/status` response |
| Chat returns `503` after attempts | Model/provider quota, provider HTTP errors, timeouts, response rejected as unsafe/non-Spanish; Vercel runtime logs |
| Financial chat is refused | `financialScope.ts`, valid `context.section`, submitted message length, accepted export format and follow-up history |
| Iframe context/history missing | `NEXT_PUBLIC_LITA_PARENT_ORIGINS`, correct LTC origin/iframe window, parent event contract, LTC Firestore permissions |
| `AUTH_NOT_CONFIGURED` during PDF upload | Missing/mismatched `FIREBASE_PROJECT_ID` in Lita Vercel environment |
| `AUTH_KEY_UNAVAILABLE` | Google's public key service availability / networking; fail closed and retry |
| PDF parser `422` | Unsupported/scanned layout, bad signature/page count or bank total mismatch; use a synthetic regression fixture |
| File cleanup error | Edge Store was explicitly enabled; verify temporary upload credentials/deletion and do not declare analysis successful |
| Works on Preview but not production | Compare Vercel commit, target, aliases and env scope, then verify the actual LTC-called hostname |

### Compatibility checklist for LTC changes

If LTC changes its iframe host, update both sides' event/origin rules. If LTC changes the PDF review schema, coordinate the parser output with `src/services/cardStatementService.js`. If LTC adds new category metadata, test that it is never interpreted as instruction to Lita's provider router. Maintain ARS/USD isolation and do not double-count card statement purchases as transactions.

Additional source documents: [system architecture](architecture.md), [provider setup](ai-providers.md), [PDF parser and security](card-statement-pdf.md), and the [LTC engineering README](https://github.com/franciscofunes/lleva-tus-cuentas).

### Standalone LTC advice endpoint

`POST /api/ltc/advice` requires `FIREBASE_PROJECT_ID`, the same as statement PDF analysis, and only accepts a short JSON message plus a verified Firebase bearer token from an allowed LTC Origin. Run `node --test tests/ltc-advice.test.mjs` to verify origin and payload guards. It delegates actual model calls to the existing server-side Lita chat pipeline; there is **no** OpenAI credential in the LTC browser. Rotate/delete a previously published `REACT_APP_OPENAI_API_KEY` in LTC hosting providers after the client change ships. Origins for additional previews can be set via `LTC_ALLOWED_ORIGINS`.
