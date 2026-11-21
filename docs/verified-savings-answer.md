# Savings answers: verified months, no hallucinated income

Lita handles questions like **"¿Cuánto podría ahorrar si mantengo este ritmo de ingresos y gastos?"** without a generative model.

## Data and calculations

- Only the **authenticated LTC parent** can query the last **six finished calendar months** through the existing `lita:forecast:request` protocol.
- `buildLitaSpendingForecast` (LTC) computes a weighted monthly expense baseline for each currency when there are three observed expense months.
- Monthly savings is valid **only if** every one of the latest three observed expense months has recorded income in that currency. `possibleMonthlySavings` must agree with monthly income minus monthly expense. With missing or inconsistent income data, the answer explicitly says savings cannot be estimated; it may still show the verified **monthly expense**.
- A positive difference is **hypothetical savings**, a negative difference is **hypothetical deficit**, neither a guaranteed bank balance nor a net worth change.
- `topCategories[].projectedMonthly` are *subsets* of the monthly expense baseline. Do not add them again. A registered card statement is a cash outflow in Transacciones, not individual PDF purchases.
- ARS and USD remain separate; a missing month is **not** zero. The current Transactions filter (`spendingByCategory`) is **not** used for monthly savings.
- The answer never invents example incomes, fixed costs, future card bills or an exchange rate.
- For explicit spend-reduction percentage scenarios, Lita retains the existing forecast/projection path; it does not disguise the baseline savings response as a what-if simulation.

## User experience and defense in depth

- `src/components/Chat.tsx` intercepts savings prompts and sends one aggregate request to the host, then creates the final answer locally. This works even when no external LLM provider is available.
- The server `/api/chat` intercepts those savings prompts too, before routing to providers; without an authenticated aggregate it returns an honest unavailable explanation. This is a safety fallback for direct API clients, not a way to read accounts.
- The extra **Gastos calculados por LTC** current-visible-filter card is suppressed for savings and forecast answers to avoid mixing incompatible time ranges.
- No new Firestore writes, provider credentials or third-party financial data transfers.

## Example missing-income answer

> **No puedo estimar cuánto podrías ahorrar por mes en ARS** porque faltan ingresos registrados en los mismos tres meses con gastos más recientes.
>
> - Gasto mensual de referencia: **[importe real calculado por LTC]**
> - Faltan ingresos en: **[meses sin ingresos registrados]**

Then, if present, the report shows its *monthly* category projections with a note that they are already included in total expenses.

## Validation

```sh
node --test tests/savings-answer.test.mjs tests/spending-forecast.test.mjs
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

Smoke-test with a signed-in user who has 6 expense months but missing income, another with income in all 3 comparable months, a negative monthly balance, and a user with sparse history. Check mobile Android screenshot and chat-history save after a deterministic answer.

## Bimonetary balance: ARS cash flow versus USD assets

The reply now begins with **both ARS and USD**, even if USD has too few expense months to compute savings. It never calls a monthly negative ARS difference "global deficit" or concludes the user is losing savings.

- LTC provides `currencies.USD.incomeObserved` independently of USD expense history: 3+ observed income months yield a weighted monthly income reference; fewer months yield only a **historical income total**, never extrapolated salary.
- The USD monthly **savings** figure still requires >=3 USD expense months with matching USD income months. A USD salary with no USD spending records is **not** automatically 100% saved.
- Optional `portfolioBalances.byCurrency` provides aggregated registered ARS/USD Portfolio positions as **stock**, never income, cash-flow savings, or audited liquid balances.
- The user may fund an ARS shortfall with conversions from USD, but the assistant does not invent a spot rate, reclassify a USD sale as income, or double count the USD Portfolio and Bank accounts.
- The answer omits distracting expense-category breakdowns to keep the bimonetary comparison near the top on mobile. Categories remain available in the report and dedicated spending questions.
- The prior optional fields are backward-compatible: if Portfolio access is unavailable, show an explicit unavailable status rather than treating the balance as zero.

Merge the LTC companion PR providing `incomeObserved` and `portfolioBalances` **before** deploying this Lita change; test real authenticated data in both sections, with ARS deficits and sparse USD spending history.
