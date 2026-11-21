import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatVerifiedSpendingForecast } from '../src/lib/verifiedSpendingAnswer.ts'

const expense = {
  baseMonthly: 3059885.31, lowMonthly: 2715613.61, highMonthly: 3224557.31,
  scenarios: [
    { months: 1, base: 3059885.31, low: 2715613.61, high: 3224557.31 },
    { months: 3, base: 9179655.93, low: 8146840.83, high: 9673671.93 },
    { months: 6, base: 18359311.86, low: 16293681.66, high: 19347343.86 },
  ],
}
const data = () => ({
  scope: 'spending-forecast', quality: { unclassifiedCount: 2 },
  currencies: {
    ARS: {
      status: 'ok', observedExpenseMonths: 6,
      missingExpenseMonths: [], expense,
      topCategories: [
        { category: 'Resumen tarjeta', projectedMonthly: 1706286.58 },
        { category: 'Regalo', projectedMonthly: 575000 },
        { category: 'Hogar', projectedMonthly: 420585.23 },
      ],
    },
    USD: {
      status: 'insufficient-data', observedExpenseMonths: 1,
      missingExpenseMonths: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
      expense: null,
      incomeObserved: { observedIncomeMonths: 3, baseMonthly: 5500 },
      topCategories: [],
    },
  },
})

test('the exact screenshot question produces complete amounts, not blank bullets', () => {
  const answer = formatVerifiedSpendingForecast(data(), '¿Cuánto voy a gastar el próximo mes?', 1)
  assert.match(answer, /^\*\*Gastos estimados para el próximo mes/)
  for (const amount of ['3.059.885,31', '2.715.613,61', '3.224.557,31']) {
    assert.ok(answer.includes(amount), amount)
  }
  assert.match(answer, /Resumen tarjeta/)
  assert.match(answer, /USD: sin estimación disponible/)
  assert.doesNotMatch(answer, /spendingForecast|scenarios\[|insufficient-data|low.*base.*high|\bundefined\b|NaN/)
  assert.doesNotMatch(answer, /registrar los meses faltantes/)
})

test('3-month aggregate uses verified 3-month scenario, no LLM multiplications', () => {
  const answer = formatVerifiedSpendingForecast(data(), '¿Cuánto gastaré en los próximos 3 meses?', 3)
  assert.match(answer, /9.179.655,93/)
  assert.match(answer, /8.146.840,83/)
  assert.match(answer, /9.673.671,93/)
  assert.match(answer, /3 meses/)
})

test('explicit reduction produces arithmetic assumption but no automatic savings claims', () => {
  const answer = formatVerifiedSpendingForecast(data(), 'Simulá escenarios de gastos si reduzco mis gastos un 15%', 1)
  assert.match(answer, /15 %/)
  assert.match(answer, /2.600.902,51/)
  assert.doesNotMatch(answer, /podrías ahorrar|sueldo|rentabilidad/)
})

test('unknown USD is not zero, and ARS/USD are never converted', () => {
  const answer = formatVerifiedSpendingForecast(data(), '¿Cuánto voy a gastar el próximo mes?', 1)
  assert.match(answer, /1 mes con gastos registrados/)
  assert.doesNotMatch(answer, /USD.*0,00/)
  assert.doesNotMatch(answer, /(?:ARS a USD|cambio del dólar)/)
})

test('missing history never invents expense amounts', () => {
  assert.match(formatVerifiedSpendingForecast(null, '¿Cuánto voy a gastar el próximo mes?'), /No recibí/)
  const x = data()
  x.currencies.ARS.expense = null
  x.currencies.ARS.observedExpenseMonths = 1
  const answer = formatVerifiedSpendingForecast(x, '¿Cuánto voy a gastar el próximo mes?', 1)
  assert.match(answer, /Todavía no puedo proyectar/)
  assert.doesNotMatch(answer, /3.059.885,31/)
})

test('the client and server never route an ordinary expense forecast through AI', () => {
  const chat = readFileSync(new URL('../src/components/Chat.tsx', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../src/app/api/chat/route.ts', import.meta.url), 'utf8')
  assert.match(chat, /formatVerifiedSpendingForecast\(projection, question, forecast\.months\)/)
  assert.doesNotMatch(chat, /setPendingForecastPrompt\(question\)/)
  assert.match(route, /X-Lita-Answer-Source': 'verified-spending'/)
  assert.ok(route.indexOf('formatVerifiedSpendingForecast(aggregate') < route.indexOf('const providers = getProviderAttemptOrder()'))
})
