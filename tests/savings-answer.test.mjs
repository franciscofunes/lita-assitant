import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatVerifiedSavingsAnswer, requestedSavingsEstimate } from '../src/lib/savingsAnswer.ts'
import { requestedSpendingForecast } from '../src/lib/spendingForecast.ts'

const month = (date, expense, income = 0, incomeRecords = 0) => ({
  month: date, expense, income, hasExpenseData: true, incomeRecords,
})

const aggregate = (withIncome = true) => ({
  scope: 'spending-forecast',
  historyFrom: '2026-05-01',
  historyThrough: '2026-10-31',
  quality: { unclassifiedCount: 2 },
  currencies: {
    ARS: {
      currency: 'ARS', status: 'ok', observedExpenseMonths: 6,
      missingExpenseMonths: [],
      expense: { baseMonthly: 3059885.31, lowMonthly: 2715613.61, highMonthly: 3224557.31 },
      income: withIncome ? { baseMonthly: 4000000, observedIncomeMonths: 3 } : null,
      possibleMonthlySavings: withIncome ? 940114.69 : null,
      monthly: [
        month('2026-05', 2800000), month('2026-06', 2900000),
        month('2026-07', 3000000), month('2026-08', 3100000, 4300000, withIncome ? 1 : 0),
        month('2026-09', 3200000, 4100000, withIncome ? 1 : 0),
        month('2026-10', 3100000, 4000000, withIncome ? 1 : 0),
      ],
      topCategories: [
        { category: 'Resumen tarjeta', projectedMonthly: 1706286.58, totalLastSixMonths: 8700000 },
        { category: 'Regalo', projectedMonthly: 575000, totalLastSixMonths: 2900000 },
        { category: 'Hogar', projectedMonthly: 420585.23, totalLastSixMonths: 2400000 },
      ],
    },
    USD: { currency: 'USD', status: 'insufficient-data', observedExpenseMonths: 2, expense: null, income: null,
      possibleMonthlySavings: null, monthly: [], topCategories: [] },
  },
})

test('detects savings intent in the screenshot question and does not hijack expense-reduction scenarios', () => {
  for (const prompt of [
    '¿Cuánto podría ahorrar si mantengo este ritmo de ingresos y gastos?',
    '¿Cuánto ahorro mensual tengo?',
    '¿Cuánto me quedaría después de los gastos?',
  ]) assert.equal(requestedSavingsEstimate(prompt), true, prompt)
  for (const prompt of [
    '¿Cuánto gastaría el mes que viene?',
    'Simulá mis gastos si reduzco mis gastos un 15%',
    '¿Cuánto podría ahorrar si reduzco los gastos un 20%?',
    'Cuál es el ahorro de la tarjeta crédito?',
  ]) assert.equal(requestedSavingsEstimate(prompt), false, prompt)
  const question = '¿Cuánto podría ahorrar si mantengo este ritmo de ingresos y gastos?'
  assert.equal(requestedSpendingForecast(question)?.months, 1)
})

test('savings answer begins with a concrete value and shows verified income minus expense', () => {
  const reply = formatVerifiedSavingsAnswer(aggregate())
  assert.match(reply, /^\*\*Podrías ahorrar aproximadamente/)
  assert.match(reply, /940\.114,69/)
  assert.match(reply, /Ingresos: \*\*/)
  assert.match(reply, /4\.000\.000,00/)
  assert.match(reply, /3\.059\.885,31/)
  assert.match(reply, /Resumen tarjeta/)
  assert.match(reply, /ya incluidas en el total/)
  assert.doesNotMatch(reply, /(?:\bundefined\b|\bNaN\b|\bInfinity\b)/)
  assert.doesNotMatch(reply, /2\.005\.302,29/) // Do not substitute current visible totals.
})

test('missing income never becomes an invented monthly savings figure or empty label', () => {
  const reply = formatVerifiedSavingsAnswer(aggregate(false))
  assert.match(reply, /^\*\*No puedo estimar cuánto podrías ahorrar por mes en ARS/)
  assert.match(reply, /3\.059\.885,31/)
  assert.match(reply, /2026-08, 2026-09, 2026-10/)
  assert.doesNotMatch(reply, /4\.000\.000,00|940\.114,69/)
  assert.doesNotMatch(reply, /Ingresos:|Ingresos promedio mensual:/)
})

test('disjoint income months cannot justify positive savings even if the host savings field is stale', () => {
  const data = aggregate()
  data.currencies.ARS.monthly[5].incomeRecords = 0
  const reply = formatVerifiedSavingsAnswer(data)
  assert.match(reply, /No puedo estimar cuánto podrías ahorrar/)
  assert.doesNotMatch(reply, /940\.114,69/)
  const inconsistent = aggregate()
  inconsistent.currencies.ARS.possibleMonthlySavings = 800000
  assert.match(formatVerifiedSavingsAnswer(inconsistent), /No puedo estimar cuánto podrías ahorrar/)
})

test('a negative difference is described as deficit, never as money saved', () => {
  const data = aggregate()
  data.currencies.ARS.income.baseMonthly = 2000000
  data.currencies.ARS.possibleMonthlySavings = -1059885.31
  const reply = formatVerifiedSavingsAnswer(data, 3)
  assert.match(reply, /déficit estimado/)
  assert.match(reply, /1\.059\.885,31/)
  assert.match(reply, /3 meses/)
  assert.doesNotMatch(reply, /^\*\*Podrías ahorrar/)
})

test('valid ARS and USD are kept independent; missing months never counted as zero', () => {
  const data = aggregate()
  data.currencies.USD = {
    currency: 'USD', status: 'partial-history', observedExpenseMonths: 3,
    missingExpenseMonths: ['2026-05', '2026-06', '2026-07'],
    expense: { baseMonthly: 150, lowMonthly: 100, highMonthly: 200 },
    income: null, possibleMonthlySavings: null,
    monthly: [month('2026-08', 100), month('2026-09', 150), month('2026-10', 200)],
    topCategories: [],
  }
  const reply = formatVerifiedSavingsAnswer(data)
  assert.match(reply, /por mes en ARS/)
  assert.match(reply, /por mes en USD/)
  assert.match(reply, /Meses sin gastos registrados: 2026-05, 2026-06, 2026-07/)
  assert.match(reply, /\bUSD\b/)
  assert.doesNotMatch(reply, /conversi[oó]n de tipo de cambio|ARS a USD/)
})

test('no historical evidence -> no amount and no fictional annual forecast', () => {
  assert.match(formatVerifiedSavingsAnswer(null), /No puedo estimar/)
  assert.match(formatVerifiedSavingsAnswer({ scope: 'spending-forecast' }), /No recibí datos/)
  const reply = formatVerifiedSavingsAnswer({
    scope: 'spending-forecast',
    currencies: { ARS: { observedExpenseMonths: 2, expense: null }, USD: { expense: null } },
  })
  assert.match(reply, /tres meses completos/)
  assert.doesNotMatch(reply, /\$\s*0/)
})

test('both client and direct API bypass AI for verified savings; no visible totals attached to forecast', () => {
  const chat = readFileSync(new URL('../src/components/Chat.tsx', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../src/app/api/chat/route.ts', import.meta.url), 'utf8')
  assert.match(chat, /formatVerifiedSavingsAnswer\(projection, forecast\.months\)/)
  assert.match(chat, /!requestedSavingsEstimate\(/)
  assert.match(chat, /!requestedSpendingForecast\(/)
  assert.match(route, /X-Lita-Answer-Source': 'verified-savings'/)
  assert.ok(route.indexOf('if (requestedSavingsEstimate(mostRecent?.content))') <
    route.indexOf('const providers = getProviderAttemptOrder()'))
})
