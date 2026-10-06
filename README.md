# AI LITA BOT

LITA is the AI sidecar for **Lleva Tus Cuentas**. It is a Next.js application deployed on Vercel and embedded inside the React SPA.

## Architecture

```text
Lleva Tus Cuentas (React / Netlify)
        |
        | postMessage: lita:context
        v
LITA iframe (Next.js / Vercel)
        |
        | /api/chat
        v
Provider pool
  ├─ Vercel AI Gateway
  ├─ Groq
  ├─ OpenRouter
  ├─ NVIDIA NIM
  └─ Google AI Studio
```

The SPA sends the current **Transactions** or **Portfolio** context to the iframe with `postMessage`. LITA sends that context with each chat request, so there is no cross-origin `no-cors` cache or temporary server state to synchronize.

The API route treats financial context as untrusted data and adds finance-specific instructions: do not invent missing values, do not mix currencies without an explicit FX rate, and distinguish balance changes from investment gains.

## Provider resilience

The provider pool supports two strategies:

- `round-robin` — rotates which configured provider is attempted first.
- `ordered` — always follows `AI_PROVIDER_ORDER`.

If a provider times out, rejects the request, is rate-limited, or is unavailable, LITA moves to the next configured provider. A successful streaming response is returned immediately.

Vercel AI Gateway can also use `AI_GATEWAY_FALLBACK_MODELS`, giving LITA a second layer of model fallback before the application moves to another provider.

> The round-robin cursor is intentionally best-effort and stateless. Vercel Functions can have multiple warm instances, so this distributes traffic without requiring Redis. If strict global round-robin becomes necessary, move the cursor to a shared store.

## Free-provider strategy

The provider list was designed around OpenAI-compatible free tiers catalogued by [itsfree.ai](https://itsfree.ai/), plus Vercel AI Gateway.

Free quotas and model lists change frequently. Do not hard-code a model because it is free today; configure model IDs through Vercel environment variables and periodically re-check the provider's official documentation.

For real personal financial data, review each provider's retention/training policy before enabling it. A provider being free or OpenAI-compatible does **not** mean it is appropriate for sensitive production data.

## Environment variables

Copy `.env.example` and configure only the providers you want. Providers without both an API key/token and model are ignored.

### Vercel configuration checklist

The legacy `OPENAI_API_KEY` variable by itself is **not** consumed by the new provider router. At least one complete provider configuration is required.

For AI Gateway on Vercel, the minimum is:

```bash
AI_GATEWAY_MODEL=<model-id>
```

The deployment can use Vercel's `VERCEL_OIDC_TOKEN` automatically, so `AI_GATEWAY_API_KEY` is optional on Vercel.

Recommended routing controls:

```bash
AI_PROVIDER_STRATEGY=round-robin
AI_PROVIDER_ORDER=gateway,groq,openrouter,nvidia,google
AI_PROVIDER_TIMEOUT_MS=12000
LITA_MAX_OUTPUT_TOKENS=700
LITA_MAX_HISTORY_MESSAGES=20
LITA_MAX_CONTEXT_CHARS=24000
NEXT_PUBLIC_LITA_PARENT_ORIGINS=https://lleva-tus-cuentas.netlify.app,http://localhost:3000
```

`GET /api/status` reports whether at least one provider is configured and returns provider IDs/labels only; it never returns credentials.

Recommended production starting point:

1. Vercel AI Gateway as the primary path.
2. One or two direct OpenAI-compatible providers as capacity/rate-limit fallback.
3. OpenRouter free routing as a last-resort pool if its current limits and data policy fit the application.

On Vercel, AI Gateway can authenticate with the deployment's `VERCEL_OIDC_TOKEN`, so no AI Gateway secret is required in source code.

## Context contract

The iframe accepts messages only from allowed parent origins:

```ts
{
  type: 'lita:context',
  payload: {
    section: 'transactions' | 'portfolio',
    // current financial context
  }
}
```

Configure additional parent origins with `NEXT_PUBLIC_LITA_PARENT_ORIGINS`.

## Local development

```bash
npm install
npm run dev
```

LITA currently uses Next.js 13 and the Vercel AI SDK v2 streaming helpers. The provider router intentionally uses the OpenAI-compatible HTTP shape so providers can be changed without adding a provider-specific SDK.

## Deployment

The GitHub repository is linked to the Vercel project **lita**. Vercel preview deployments are created from branches. Production should point at the current `main` deployment before the React SPA is switched to the new integration.
