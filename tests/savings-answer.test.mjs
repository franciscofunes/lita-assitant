import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatVerifiedSavingsAnswer, requestedSavingsEstimate } from '../src/lib/savingsAnswer.ts'
import { requestedSpendingForecast } from '../src/lib/spendingForecast.ts'

const month = (date, expense, income = 0, incomeRecords = 0) => ({
  month: date, expense, income, hasExpenseData: true, incomeRecords,
})

const aggregate = (arsIncome = 656522.02) => ({
  scope: 'spending-forecast',
  historyFrom: '2026-05-01',
  historyThrough: '2026-10-31',
  quality: { unclassifiedCount: 2 },
  currencies: {
    ARS: {
      currency: 'ARS', status: 'ok', observedExpenseMonths: 6,
      expense: { baseMonthly: 3059885.31 },
      income: arsIncome === null ? null : { baseMonthly: arsIncome },
      incomeObserved: {
        observedIncomeMonths: arsIncome === null ? 0 : 3,
        totalLastSixMonths: arsIncome === null ? 0 : 1969566.06,
        baseMonthly: arsIncome,
      },
      possibleMonthlySavings: arsIncome === null ? null : -2403363.29,
      monthly: [
        month('2026-05', 2800000), month('2026-06', 2900000),
        month('2026-07', 3000000), month('2026-08', 3100000, 650000, arsIncome === null ? 0 : 1),
        month('2026-09', 3200000, 650000, arsIncome === null ? 0 : 1),
        month('2026-10', 3100000, 650000, arsIncome === null ? 0 : 1),
      ],
    },
    USD: {
      currency: 'USD', status: 'insufficient-data',
      observedExpenseMonths: 0, expense: null, income: null,
      incomeObserved: {
        observedIncomeMonths: 3,
        missingIncomeMonths: ['2026-05', '2026-06', '2026-07'],
        totalLastSixMonths: 16500,
        baseMonthly: 5500,
      },
      possibleMonthlySavings: null,
      monthly: [month('2026-08', 0, 5500, 1), month('2026-09', 0, 5500, 1), month('2026-10', 0, 5500, 1)],
    },
  },
  portfolioBalances: {
    source: 'portfolioPositions', status: 'ok',
    byCurrency: {
      ARS: { balance: 200000, positionCount: 1 },
      USD: { balance: 110000.50, positionCount: 3 },
    },
  },
})

test('detects original savings question and new bimonetary quick prompt, not percentage what-ifs', () => {
  for (const prompt of [
    '¿Cuánto podría ahorrar si mantengo este ritmo de ingresos y gastos?',
    '¿Cuánto podría ahorrar en pesos y dólares con mis ingresos, gastos y Portfolio?',
    '¿Cuánto ahorro mensual tengo?',
    '¿Cuánto me quedaría después de los gastos?',
  ]) assert.equal(requestedSavingsEstimate(prompt), true, prompt)
  for (const prompt of [
    '¿Cuánto gastaría el mes que viene?',
    'Simulá mis gastos si reduzco mis gastos un 15%',
    '¿Cuánto podría ahorrar si reduzco los gastos un 20%?',
  ]) assert.equal(requestedSavingsEstimate(prompt), false, prompt)
  assert.equal(requestedSpendingForecast('¿Cuánto podría ahorrar si mantengo este ritmo?')?.months, 1)
})

test('ARS negative and USD salary positive: never claim overall deficit or hide dollars', () => {
  const reply = formatVerifiedSavingsAnswer(aggregate())
  assert.match(reply, /^\*\*Tu situación es bimonetaria/)
  assert.match(reply, /ARS.*2\.403\.363,29/)
  assert.match(reply, /USD.*5\.500,00/)
  assert.match(reply, /USD.*ahorro en USD \*\*no calculable\*\*/)
  assert.match(reply, /USD US\$\s*110\.000,50/)
  assert.match(reply, /patrimonio en dólares/)
  assert.match(reply, /no implica por sí sola/)
  assert.doesNotMatch(reply, /no habría ahorro mensual|déficit total|estás perdiendo plata/)
  assert.doesNotMatch(reply, /\bundefined\b|\bNaN\b|\bInfinity\b/)
  assert.doesNotMatch(reply, /2\.005\.302,29/)
  assert.ok(reply.indexOf('**USD:**') < reply.indexOf('### Ahorros y activos'))
})

test('ARS and USD flows without Portfolio still clearly report unavailable stock', () => {
  const data = aggregate()
  delete data.portfolioBalances
  const reply = formatVerifiedSavingsAnswer(data)
  assert.match(reply, /No recibí datos del Portfolio/)
  assert.match(reply, /ARS/)
  assert.match(reply, /USD/)
})

test('insufficient USD spending does not silently turn income into 100% USD savings', () => {
  const reply = formatVerifiedSavingsAnswer(aggregate())
  assert.match(reply, /sin tres meses con gastos registrados en USD/)
  assert.match(reply, /ahorro en USD \*\*no calculable\*\*/)
  assert.doesNotMatch(reply, /ahorraste .*5\.500/)
  assert.match(reply, /No hay cotización ni conversión implícita/)
})

test('USD sparse income totals are historical, not turned into an unsupported monthly salary', () => {
  const data = aggregate()
  data.currencies.USD.incomeObserved = { observedIncomeMonths: 1, totalLastSixMonths: 6700, baseMonthly: null }
  const reply = formatVerifiedSavingsAnswer(data)
  assert.match(reply, /USD.*6\.700,00 en 1 mes.*sin promedio confiable/)
  assert.doesNotMatch(reply, /USD.*6\.700,00\/mes/)
})

test('missing ARS income makes ARS savings unknown while USD stays visible', () => {
  const data = aggregate(null)
  const reply = formatVerifiedSavingsAnswer(data)
  assert.match(reply, /ARS.*sin tres meses de ingresos económicos clasificados en esta moneda/)
  assert.match(reply, /USD.*5\.500,00/)
  assert.doesNotMatch(reply, /2\.403\.363,29/)
})

test('negative ARS is cash gap only, not global deficit; no FX rate invented', () => {
  const reply = formatVerifiedSavingsAnswer(aggregate(), 3)
  assert.match(reply, /faltante de caja en ARS/)
  assert.match(reply, /Escenario a 3 meses/)
  assert.match(reply, /ARS/)
  assert.match(reply, /hace falta un tipo de cambio explícito/)
  assert.doesNotMatch(reply, /cotización.*(?:1\.4\d{2}|1\.5\d{2})/)
})

test('USD savings can be calculated when USD income and expenses match three observed months', () => {
  const data = aggregate()
  data.currencies.USD = {
    currency: 'USD', observedExpenseMonths: 3,
    expense: { baseMonthly: 300 }, income: { baseMonthly: 5500 },
    incomeObserved: { observedIncomeMonths: 3, totalLastSixMonths: 16500, baseMonthly: 5500 },
    possibleMonthlySavings: 5200,
    monthly: [month('2026-08', 300, 5500, 1), month('2026-09', 300, 5500, 1), month('2026-10', 300, 5500, 1)],
  }
  const reply = formatVerifiedSavingsAnswer(data)
  assert.match(reply, /diferencia favorable en USD/)
  assert.match(reply, /USD.*5\.200,00/)
  assert.match(reply, /no se suman ARS y USD/)
})

test('stale mismatched monthly data cannot justify a savings estimate', () => {
  const data = aggregate()
  data.currencies.ARS.monthly[5].incomeRecords = 0
  const reply = formatVerifiedSavingsAnswer(data)
  assert.match(reply, /ahorro en ARS \*\*no calculable\*\*/)
  assert.doesNotMatch(reply, /2\.403\.363,29/)
  const stale = aggregate()
  stale.currencies.ARS.possibleMonthlySavings = 800000
  assert.doesNotMatch(formatVerifiedSavingsAnswer(stale), /800\.000,00/)
})

test('empty and invalid data never becomes zero balances or fabricated savings', () => {
  assert.match(formatVerifiedSavingsAnswer(null), /No puedo estimar/)
  assert.match(formatVerifiedSavingsAnswer({ scope: 'spending-forecast' }), /No recibí los flujos/)
  const reply = formatVerifiedSavingsAnswer({
    scope: 'spending-forecast',
    currencies: { ARS: {}, USD: {} },
    portfolioBalances: { status: 'unavailable' },
  })
  assert.match(reply, /ARS/)
  assert.match(reply, /USD/)
  assert.match(reply, /No pude consultar saldos completos/)
  assert.doesNotMatch(reply, /\$\s*0/)
})

test('client and API still do not route baseline savings through LLM providers', () => {
  const chat = readFileSync(new URL('../src/components/Chat.tsx', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../src/app/api/chat/route.ts', import.meta.url), 'utf8')
  assert.match(chat, /formatVerifiedSavingsAnswer\(projection, forecast\.months\)/)
  assert.match(chat, /!requestedSavingsEstimate\(/)
  assert.match(route, /X-Lita-Answer-Source': 'verified-savings'/)
  assert.ok(route.indexOf('if (requestedSavingsEstimate(mostRecent?.content))') <
    route.indexOf('const providers = getProviderAttemptOrder()'))
})


test('records arriving USD in Ingreso divisas independently of classified salary and savings', () => {
  const data = aggregate()
  data.currencies.USD.incomeObserved = {
    observedIncomeMonths: 0, totalLastSixMonths: 0, baseMonthly: null,
  }
  data.currencies.USD.registeredCurrencyInflows = {
    source: 'ingreso-divisas', classification: 'unverified-income',
    observedMonths: 3, totalLastSixMonths: 15000, records: 3,
    monthly: [
      { month: '2026-08', amountUsd: 4000, records: 1 },
      { month: '2026-09', amountUsd: 5500, records: 1 },
      { month: '2026-10', amountUsd: 5500, records: 1 },
    ],
  }
  const reply = formatVerifiedSavingsAnswer(data)
  assert.match(reply, /USD.*sin tres meses de ingresos económicos clasificados en esta moneda/)
  assert.match(reply, /Entradas de USD registradas en «Ingreso divisas»/)
  assert.match(reply, /15\.000,00 en 3 meses/)
  assert.match(reply, /Estas entradas sí están registradas/)
  assert.match(reply, /No las sumo al sueldo ni las considero ahorro automáticamente/)
  assert.match(reply, /ahorro en USD \*\*no calculable\*\*/)
  assert.doesNotMatch(reply, /ahorraste .*15\.000/)
})

test('legacy category configured in USD warns to review recorded ARS snapshot without converting', () => {
  const data = aggregate()
  data.quality.usdIncomeCurrencyReview = {
    records: 2, categories: ['honorarios exterior'],
  }
  const reply = formatVerifiedSavingsAnswer(data)
  assert.match(reply, /Revisá la moneda de 2 movimientos/)
  assert.match(reply, /honorarios exterior/)
  assert.match(reply, /No los convertí automáticamente/)
  assert.doesNotMatch(reply, /ARS a USD/)
})

test('no USD inflow data does not invent currency deposits', () => {
  const data = aggregate()
  const reply = formatVerifiedSavingsAnswer(data)
  assert.doesNotMatch(reply, /Entradas de USD registradas en «Ingreso divisas»/)
})
