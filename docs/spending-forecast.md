# Spending forecasts and scenario prompts in Lita

Lita provides a **Proyecciones y escenarios** quick-question group when opened from LTC Transactions or Banks. Choosing a question fills the composer; the user sends it explicitly. Historical spending projections and card-statement comparisons are distinct.

## Transactions: bounded read-only workflow

- `src/lib/spendingForecast.ts` recognizes future-facing wording, selected forecast horizon 1–6 months, and separates it from historical-only queries.
- Only in Transactions, after `assessFinancialScope` approves the question, the iframe requests `lita:forecast:request` with a random requestId from its trusted parent host.
- LTC validates source/origin, authenticated owner, selected section and privacy visibility; it loads and aggregates the six **complete previous months**, never the current partial month. See [host forecast details](https://github.com/franciscofunes/lleva-tus-cuentas/blob/main/docs/lita-spending-forecast.md).
- Lita receives `lita:forecast:result`, applies a temporary `scope:forecast-query` context, and sends the user question to `/api/chat`. Existing conversation/history flow stays in place; on response it restores the original host context.
- Any error/timeout is shown to the user and **no guessed numeric answer is generated**.
- Historical values are not predictions: minimum/base/maximum are *nominal scenarios*, not statistical guarantees. No inferred FX rate or future installment schedule is available.
- Source amounts are separated into ARS and USD. Missing months are unknown. With fewer than 3 observed expense months the server instructs the LLM to decline numeric projections for that currency.
- `possibleMonthlySavings` is only included if enough historic income and expense months exist; it may be negative.

## Banks: source-aware comparisons

The Banks quick questions use the **existing** `monthlyCardSpending.byCurrency` context from linked recorded statement payments, not the Transactions forecast workflow. The LLM may compare history, average amounts and existing budgets, but must not present the next bank statement as known, add PDF line items twice, treat manual account balances as spendable funds, or assume outstanding installments or future exchange rates.

## Tests and rollout

```bash
node --test tests/finance-scope.test.mjs tests/spending-forecast.test.mjs tests/lita-ux-consistency.test.mjs
npm ci
npm run build
```

The GitHub Financial scope workflow executes the added intent tests and builds the Next.js app. Deployment sequence: **LTC host first, Lita second**. Verify the actual Vercel domains, parent-origin configuration and real signed-in data before declaring production ready.


## Verified forecast responses (Android truncation regression)

Questions like **«¿Cuánto voy a gastar el próximo mes?»** no longer go through generative providers. Lita receives the signed-in LTC forecast aggregate via the existing trusted iframe bridge and formats the exact low/base/high amounts **deterministically** with `formatVerifiedSpendingForecast`. This is also enforced in `/api/chat` as a fallback against direct requests. This prevents blank bullet-point amounts, interrupted model responses, and leaks of internal names such as `spendingForecast.currencies.ARS.expense.scenarios[1]`.

ARS and USD are displayed separately. Fewer than 3 observed expense months in USD means no USD forecast (missing months are not zero); available ARS figures are still shown immediately. The categories shown are already included in total expenses; they must not be added again. A simple explicit percentage reduction is applied only as an identified hypothetical assumption. Savings and Portfolio positions are separate workflows.

Regression tests: `tests/verified-spending-answer.test.mjs` plus CI Next.js build.
