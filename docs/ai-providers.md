# AI providers

The chat route accepts an OpenAI-compatible `/chat/completions` endpoint.

Configure the primary provider with `AI_BASE_URL`, `AI_API_KEY`, and
`AI_MODEL`. Optionally configure the corresponding `AI_FALLBACK_*`
variables. The fallback is attempted when the primary returns HTTP 429 or a
5xx response.

API keys are server-side secrets. Never prefix them with `NEXT_PUBLIC_`, put
them in source code, screenshots, issues, or commit them to Git.

Provider URLs, model IDs, quotas and free tiers change over time. Copy the
current endpoint and model identifier from the provider's documentation when
configuring the deployment.

After deployment, test:
- a normal chat request,
- missing configuration (503),
- invalid credential handling,
- rate-limit/fallback behavior,
- that no key appears in browser network responses.
