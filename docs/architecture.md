# Lita — architecture, protocols, and safety contracts

Lita is the server-side AI/PDF companion to [LTC](https://github.com/franciscofunes/lleva-tus-cuentas). These notes document **the current source on main**. They do not imply autonomous financial execution, durable model memory, general browsing or Firebase Admin access.

## 1. Runtime boundaries

~~~mermaid
flowchart TB
    subgraph Browser["Browser"]
       Parent["LTC React application<br/>Netlify"]
       Frame["Embedded Lita Chat client<br/>Next.js"]
       Parent <-- "origin-checked postMessage" --> Frame
    end
    subgraph Vercel["Vercel Node.js Functions"]
       Chat["/api/chat<br/>financial scope + provider attempts"]
       PDF["/api/card-statements/analyze<br/>token and PDF validation"]
       Status["/api/status<br/>provider readiness"]
    end
    Frame --> Chat
    Chat --> Pool["Configured remote AI providers"]
    Parent -- "multipart PDF + Firebase ID token" --> PDF
    PDF --> Auth["Google SecureToken JWKS"]
    PDF --> Parse["PDF.js digital text parser"]
    Parse -- "reconciled JSON" --> Parent
    Parent --> DB[("Cloud Firestore<br/>users/{uid}")]
    Status --> Pool
~~~

- **LTC:** Firebase sign-in, Firestore reads/writes, chart calculations, Lita iframe context, conversation persistence, card statement review.
- **Lita client:** chat transcript UI, Markdown/transaction wizard, theme/context/history message handling.
- **Lita server:** external AI provider routing and deterministic PDF parsing; no direct financial-account write privilege.
- **External providers:** receive selected messages and bounded financial context when chat is invoked; evaluate their privacy policies.

## 2. Host ↔ iframe contract

~~~mermaid
sequenceDiagram
    participant Parent as LTC parent window
    participant Frame as Lita iframe
    participant API as /api/chat
    participant DB as User Firestore
    Parent->>DB: Load recent litaChats
    Parent->>Frame: lita:context (transactions or portfolio)
    Parent->>Frame: lita:theme + lita:history
    Frame-->>Parent: lita:ready
    Parent->>Frame: Refresh context, theme and history
    Frame->>API: messages + current financial context
    API-->>Frame: Validated Spanish financial response
    Frame-->>Parent: Chat thread history updates
    Parent->>DB: Save thread under authenticated UID
~~~

The parent host in `src/components/LitaAssitantPanel.js` uses an exact iframe window source and a computed target origin. The iframe in `src/components/Chat.tsx` checks allowed LTC parent origins (including configured and restricted preview origins). The message contract includes `lita:context`, `lita:history`, `lita:history:status`, `lita:theme` and UI/layout/ready events.

History belongs to `users/{uid}/litaChats` and is synchronized by the **LTC browser client** using Firebase rules. Lita is not a standalone authenticated chat-history database. If iframe history cannot load, inspect origin checks and LTC Firestore permissions rather than expecting Vercel storage.

## 3. Chat request lifecycle

~~~mermaid
flowchart TD
    Incoming["POST /api/chat"] --> Parse["Parse JSON, normalize + bound messages"]
    Parse --> Scope{"Latest conversation<br/>within financial scope?"}
    Scope -- "No" --> Denied["Restricted or oversize response"]
    Scope -- "Yes" --> Ctx{"Valid context section:<br/>transactions or portfolio?"}
    Ctx -- "No" --> Denied
    Ctx -- "Yes" --> Prompt["Build bounded Spanish financial context<br/>and safe follow-up history"]
    Prompt --> Pool["Configured provider attempt order"]
    Pool --> Try["Call provider with timeout"]
    Try --> Safe{"HTTP success and<br/>safe final answer?"}
    Safe -- "Yes" --> Return["Return validated response"]
    Safe -- "No" --> Next{"Next configured provider?"}
    Next -- "Yes" --> Try
    Next -- "No" --> Fail["503; retry later"]
~~~

**Financial domain:** `financialScope.ts` disallows off-topic queries. `financialConversation.ts` handles eligible contextual follow-ups without simply trusting short approval messages in isolation. `route.ts` prepares a bounded context system message that explicitly treats the host's finances as untrusted **data** and requests answers in Argentinian Spanish. Provider output is buffered and screened (`sanitizeAssistantOutput`); hidden reasoning and English-dominant output are not passed through. This is defense-in-depth, not proof that any language model is infallible.

**Limits:** recent chat history and serialized context are capped via `LITA_MAX_HISTORY_MESSAGES` / `LITA_MAX_CONTEXT_CHARS`; eligible pasted financial exports have separate scope limits. The server cannot independently browse live rates, verify holdings, or apply proposed asset updates. No Firebase token check is performed by **`/api/chat`** in the current code; do **not** describe it as a signed financial-data API or add Firestore mutations without designing proper auth first.

**Provider selection:** `aiProviders.ts` supports a prioritized order and a best-effort per-instance round-robin starting index. Gateway fallback models are separate from trying the next configured provider. Function instances do not share a cursor or long-lived provider session.

## 4. Digital Visa PDF analysis lifecycle

~~~mermaid
sequenceDiagram
    participant LTC as Authenticated LTC browser
    participant API as Lita PDF API
    participant JWT as Google public signing keys
    participant Store as Optional temporary Edge Store
    participant Parser as Deterministic PDF parser
    LTC->>API: POST /api/card-statements/analyze
    API->>API: Validate allowed Origin and request limits
    API->>JWT: Verify Firebase token signature and claims
    JWT-->>API: Verified UID
    API->>API: Validate file MIME/bytes, %PDF signature
    opt Explicit Edge Store opt-in
      API->>Store: Protected temporary upload
    end
    API->>Parser: Extract positioned text + reconcile
    Parser-->>API: Validated result or known failure code
    opt External temporary upload used
      API->>Store: Delete temporary file
    end
    API-->>LTC: JSON draft or error
    Note over LTC: Explicit review and Firestore save happen in LTC
~~~

The API implementation lives at `src/app/api/card-statements/analyze/route.ts`; important checks include:
- Restricted LTC origins (production and a constrained Netlify deploy-preview pattern, plus configured `LTC_ALLOWED_ORIGINS`).
- `Authorization: Bearer <Firebase ID token>`; the UID is derived from cryptographically verified signature, issuer, audience and expiry via `statementAuth.ts`.
- PDF size up to **4 MiB**, signature checks, supported digital (non-OCR) layouts and parser-defined page bounds.
- `visaStatementParser.ts` extracts text positions and independently reconciles bank totals in each currency; failed layout/total verification is not silently turned into accepted data.
- A **per-UID, in-memory** request rate limiter exists as a soft cap. It is not globally durable across serverless instances.
- PDF bytes are processed in memory by default; temporary Edge Store upload is disabled unless explicitly enabled and secrets are present. If cleanup fails, the endpoint reports failure, not success. Raw PDFs are not submitted to the provider pool.

**Persistence occurs elsewhere:** the LTC user's browser reviews the extracted draft and writes a single summary expense and dedicated `cardStatements` / `items` records to Firestore using Firebase user authentication and live Firestore security rules. SHA-256 statement ID and cross-document validation support duplicate protection. Additional line items are not separate expenses; ARS and USD must reconcile independently.

## 5. External calls and runtime configuration

| Dependency | Purpose | Boundary |
| --- | --- | --- |
| Vercel AI Gateway / direct providers | Financial chat generation | Server-side credentials; provider training/retention policies vary |
| Google SecureToken public signing keys | Firebase ID token verification for PDF requests | Public JWKS, no service account key required |
| Edge Store (optional) | Temporary protected storage while parsing a PDF | Disabled by default, deletion attempted in `finally` |
| Firebase/Firestore | User storage **through LTC** | No direct Firestore write access via Lita chat or PDF endpoint |

`/api/status` returns only provider identifiers/labels and a readiness boolean. It is a configuration indicator, **not** a full health test of actual model responses or Firebase integration.

## 6. Failure handling and observability

- `/api/chat`: malformed JSON → 400; missing messages → 400; out-of-scope → restricted content; no providers or exhausted attempts → 503. Response headers include provider and attempt count on success.
- PDF endpoint: unsupported/invalid document or reconciliation → structured rejection; missing `FIREBASE_PROJECT_ID`, JWKS unavailable or failed storage cleanup → configuration or retry error. Logs use the `[card-statement-pdf]` prefix with **processing stage and controlled error code**, not raw PDF contents.
- Vercel logs and the actual deployment SHA are required to distinguish a **ready preview** from the **domain serving production**.

See [Development and operations](development.md) for commands, production promotion and troubleshooting, and [LTC architecture](https://github.com/franciscofunes/lleva-tus-cuentas/blob/main/docs/architecture.md) for the Firestore data model and user review lifecycle.
