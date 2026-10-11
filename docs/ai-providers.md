# Configuring Lita AI providers

[README](../README.md) · [Architecture](architecture.md) · [Development](development.md)

Lita supports a **configurable pool of OpenAI-compatible provider endpoints**, not just one primary/secondary model. Configuration lives in `src/lib/aiProviders.ts` and requests are processed by `src/app/api/chat/route.ts`.

## Routing and fallback

~~~mermaid
flowchart LR
    Chat["Validated financial chat"] --> Strategy{"Routing strategy"}
    Strategy -- "ordered" --> First["First configured provider"]
    Strategy -- "round-robin" --> Rotate["Warm-instance rotating start"]
    Rotate --> First
    First --> Validation{"Accepted final response?"}
    Validation -- "Yes" --> User["Return safe answer"]
    Validation -- "No: timeout / HTTP / unsafe" --> Next["Next configured provider"]
    Next --> Validation
    Next --> Fail["503 if all fail"]
~~~

- `AI_PROVIDER_STRATEGY=ordered`: follow `AI_PROVIDER_ORDER`, then any remaining configured providers.
- `AI_PROVIDER_STRATEGY=round-robin`: rotate the **first** attempt within a warm Vercel function instance. No shared global counter or Redis coordination.
- `AI_PROVIDER_ORDER=gateway,groq,openrouter,nvidia,google` is an example; disabled/incomplete providers are skipped.
- `AI_PROVIDER_TIMEOUT_MS` applies to provider attempts. The handler retries another provider when an attempt fails or the returned final response fails safety checks.
- `AI_GATEWAY_FALLBACK_MODELS` configures additional **Gateway models** separately from the cross-provider attempt list.

## Provider environment variables

| Provider | Model | Authentication | Default endpoint type |
| --- | --- | --- | --- |
| Vercel AI Gateway | `AI_GATEWAY_MODEL` | `AI_GATEWAY_API_KEY` or Vercel OIDC runtime auth | OpenAI-compatible Gateway |
| Groq | `GROQ_MODEL` | `GROQ_API_KEY` | OpenAI-compatible |
| OpenRouter | `OPENROUTER_MODEL` | `OPENROUTER_API_KEY` | OpenAI-compatible |
| NVIDIA NIM | `NVIDIA_MODEL` | `NVIDIA_API_KEY` | OpenAI-compatible |
| Google AI Studio | `GEMINI_MODEL` | `GEMINI_API_KEY` | OpenAI-compatible |
| Legacy provider | `AI_MODEL` | `AI_API_KEY` + `AI_BASE_URL` | Explicit URL |
| Legacy fallback | `AI_FALLBACK_MODEL` | `AI_FALLBACK_API_KEY` + `AI_FALLBACK_BASE_URL` | Explicit URL |

See [`.env.example`](../.env.example) for complete samples and request-budget controls. These are **server-only credentials**. Do not put them in a `NEXT_PUBLIC_*` variable, client source, test fixture, screenshot or GitHub issue.

## Safety, product scope and costs

1. Incoming conversation is **financial-domain restricted** before requesting a model; context is labeled as untrusted reference data.
2. The final model output is buffered and checked before release, so non-final internal tags or English-dominant answers can trigger another provider attempt. The chat UI language remains Spanish.
3. Provider data policies, retention/training practices, quotas and model IDs can change. **OpenAI API compatibility does not imply equivalent data handling**, and a zero-price tier can change or disappear.
4. Control spend via `LITA_MAX_HISTORY_MESSAGES`, `LITA_MAX_CONTEXT_CHARS` and `LITA_MAX_OUTPUT_TOKENS`; the provider's billing is independent of LTC's ledger.
5. `GET /api/status` lists only configured provider metadata and a readiness flag; it does not expose keys or verify that paid/free quota remains available.

## Verification

~~~bash
node --test tests/finance-scope.test.mjs tests/financial-conversation.test.mjs tests/transaction-wizard.test.mjs
npm run build
~~~

Check `/api/status` on the **actual production Lita domain**, then send a harmless synthetic financial question through the embedded LTC assistant. Inspect Vercel function logs for provider ID, status and attempt count without logging personal financial data. A successful Vercel preview deployment is not evidence that the LTC-called production alias has moved.
