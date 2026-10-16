# LITA — Financial AI and Statement Analysis for LTC

**A focused Next.js companion service for [Lleva Tus Cuentas](https://github.com/franciscofunes/lleva-tus-cuentas).**

[Live LTC app](https://lleva-tus-cuentas.netlify.app/) · [Architecture](docs/architecture.md) · [Development & operations](docs/development.md) · [AI provider notes](docs/ai-providers.md) · [PDF analyzer](docs/card-statement-pdf.md)

Lita is a **Next.js 13 / React 18 / TypeScript** app deployed on **Vercel**. It is embedded as an iframe inside LTC's React/Netlify application. It provides **bounded financial question answering**, configurable **AI provider fallback**, a transaction Markdown helper and a **deterministic, authenticated digital Visa PDF analyzer**.

The **application UI and financial answers are Spanish-language** by design; all architecture and developer documentation here is in English.

## What runs where?

~~~mermaid
flowchart LR
    Person["User"] --> LTC["LTC SPA<br/>Netlify + Firebase Auth"]
    LTC -- "postMessage: context / history / theme" --> Frame["Lita iframe<br/>Next.js client"]
    Frame -- "messages + context" --> Chat["POST /api/chat"]
    Chat --> Policy["Financial scope + answer checks"]
    Policy --> Router["Provider routing / fallback"]
    Router --> Models["AI providers"]
    LTC -- "PDF + Firebase ID token" --> PDF["POST /api/card-statements/analyze"]
    PDF --> Verify["Verify token + PDF signature"]
    Verify --> Parse["PDF.js positioned-text parser"]
    Parse -- "reconciled draft" --> LTC
    LTC --> DB[("Cloud Firestore<br/>user-owned history and statements")]
~~~

Lita **does not own or modify** the customer's transaction/portfolio data, and `/api/chat` is not a privileged Firestore API. **LTC** loads and saves its own `users/{uid}/litaChats` conversation history. The PDF endpoint is a separate, token-verified processing path; only the reviewed output is saved by LTC.

## Capabilities and non-goals

| Area | Implemented behavior | Boundary |
| --- | --- | --- |
| Chat | Budgeted financial context for Transactions/Portfolio, follow-up-aware conversation and Spanish output validation | **No automatic portfolio writes, general-purpose agent tools, or live web research** |
| Provider resilience | Ordered or instance-local round-robin attempts; fallback across configured gateways/providers | Availability, costs and third-party retention depend on provider configuration |
| Markdown | Streamdown rendering plus LTC transaction Markdown wizard | Text suggestions are not database mutations |
| Conversation history | Receives and displays user-specific history through the parent iframe protocol | Firestore persistence is performed by LTC |
| Statement PDFs | Authenticated up-to-4-MiB digital Visa parsing, financial reconciliation and structured JSON preview | **No OCR, scanned/unrecognized layouts fail closed, no bank PDF is sent to the chat models** |
| Diagnostics | `GET /api/status` reports configured providers and readiness | No API keys or secrets returned |

## API endpoints

| Endpoint | Method | Client | Purpose |
| --- | --- | --- | --- |
| `/api/chat` | POST | Lita UI via `useChat` | Validates financial scope/context, chooses a provider, returns validated assistant text |
| `/api/status` | GET | Health/diagnostics | `{ready, providers}` metadata only; no credentials |
| `/api/card-statements/analyze` | OPTIONS, POST | Authenticated LTC client | Restricted-origin multipart PDF analysis with Firebase ID token verification |

**Security distinction:** `/api/chat` checks that the request is in scope and includes relevant LTC financial context, but it **does not independently verify a Firebase ID token** in the current implementation. Treat caller-supplied context as untrusted, limit exposure and never make this route a data-write endpoint. `/api/card-statements/analyze` **does** verify signed Firebase tokens cryptographically and derives the UID from the token.

## Provider routing

~~~mermaid
flowchart TD
    Request["Validated financial request"] --> Pick["Attempt order"]
    Pick --> P1["Configured provider 1"]
    P1 --> OK{"HTTP success and safe Spanish final text?"}
    OK -- "Yes" --> Reply["Respond with validated text"]
    OK -- "No / timeout / rate limit" --> More{"Another configured provider?"}
    More -- "Yes" --> P2["Try next provider"]
    P2 --> OK
    More -- "No" --> Failed["Return retryable 503"]
~~~

The provider pool includes Vercel AI Gateway, Groq, OpenRouter, NVIDIA NIM, Google AI Studio (Gemini-compatible), and optional legacy OpenAI-compatible routes. Configure only providers whose terms suit the sensitivity of your financial data. `AI_PROVIDER_STRATEGY=round-robin` changes the starting attempt within an instance; this is **not** globally coordinated across Vercel functions. AI Gateway additionally supports a configured fallback model list.

Lita buffers and inspects the provider's final output to suppress reasoning tags, non-final content and English-dominant responses. The API then returns the accepted answer as a response stream; it does **not** relay unvalidated raw provider tokens to the browser.

## Getting started

**Requirements:** Node.js **24.x** (see `package.json`), npm, and at least one configured AI provider or an AI Gateway model with Vercel OIDC authentication.

~~~bash
git clone https://github.com/franciscofunes/lita-assitant.git
cd lita-assitant
npm ci
cp .env.example .env.local
# Fill in one supported provider's model + server-side key if required.
npm run dev -- -p 3005
~~~

LTC uses `http://localhost:3005` for its local iframe. Add `http://localhost:3000` to `NEXT_PUBLIC_LITA_PARENT_ORIGINS` for the LTC development origin. On Vercel, configure provider keys and `FIREBASE_PROJECT_ID` as **server-only** environment variables; the project ID must match LTC's `REACT_APP_PROJECT_ID` for PDF token validation.

For production on AI Gateway, an `AI_GATEWAY_MODEL` can use Vercel OIDC auth when deployed with the necessary identity. Outside that environment, supply a valid Gateway key. Configure other providers' `*_MODEL` plus `*_API_KEY` together. Never commit `.env.local`.

## Test and build

~~~bash
node --test tests/finance-scope.test.mjs tests/financial-conversation.test.mjs tests/transaction-wizard.test.mjs
node --test tests/visa-statement-parser.test.mjs tests/pdfjs-worker-smoke.test.cjs
npm run lint
npm run build
~~~

These commands mirror the scope and PDF regression areas covered by GitHub workflows. Follow the [operations runbook](docs/development.md) when releasing; **a Vercel preview build is not proof that production domains or Firebase token configuration have changed**.

## Source map

| Location | Responsibility |
| --- | --- |
| `src/app/page.tsx` / `src/components/Chat.tsx` | Embedded chat screen, parent protocol, Markdown rendering, history UI |
| `src/app/api/chat/route.ts` | Scope checking, context budgeting, provider selection, response validation |
| `src/lib/financialScope.ts` / `financialConversation.ts` | Allowed finance topics, follow-ups and output sanitization |
| `src/lib/aiProviders.ts` | AI provider configuration, order and fallback |
| `src/app/api/card-statements/analyze/route.ts` | Authenticated PDF request and structured response |
| `src/lib/statementAuth.ts` / `visaStatementParser.ts` | Signed Firebase token verification and deterministic reconciliation |
| `src/lib/statementTemporaryStorage.ts` | **Opt-in** temporary Edge Store upload and cleanup |
| `tests/` and `.github/workflows/` | PII-free contract and regression checks |

## Documentation

- [Architecture and end-to-end diagrams](docs/architecture.md)
- [Local development, deployment, privacy, troubleshooting](docs/development.md)
- [AI provider setup](docs/ai-providers.md)
- [Digital Visa PDF security and parser support](docs/card-statement-pdf.md)
- [LTC frontend architecture](https://github.com/franciscofunes/lleva-tus-cuentas/blob/main/docs/architecture.md)

**Privacy reminder:** avoid logging or committing banking PDFs, user prompts containing personal information, JWTs, provider credentials or statement account identifiers. The default PDF path uses volatile memory; optional temporary external storage is explicitly gated.

## Authenticated LTC financial advice API

The older, standalone LTC advice widget uses `POST /api/ltc/advice` instead of calling OpenAI from browser JavaScript. This endpoint verifies a signed Firebase ID token (same `FIREBASE_PROJECT_ID` and key rotation as PDF analysis), checks the browser Origin, bounds the prompt and applies best-effort per-instance rate limiting. It forwards a single user message to the **existing** `/api/chat` financial-scope, provider-fallback and Spanish-answer pipeline. It cannot write Firestore data. Request: `{ "message": "Consejos de ahorro" }` plus `Authorization: Bearer <Firebase ID token>`; response: UTF-8 assistant text, or `{ "error": "..." }` on errors. Supported production origins include both official LTC Netlify and Vercel domains; set `LTC_ALLOWED_ORIGINS` for additional exact origins.

This change eliminates the need for `REACT_APP_OPENAI_API_KEY` in LTC. **Rotate any previously exposed OpenAI key and remove that client-side Vercel/Netlify environment variable**; browser build variables are public. No new AI provider credentials are required beyond Lita's existing server-side setup.
