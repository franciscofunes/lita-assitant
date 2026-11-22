import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLiveFxQuotes, selectedFxQuote, fxMarketLabel } from '../src/lib/litaFxQuotes.ts'
import { formatVerifiedSavingsAnswer } from '../src/lib/savingsAnswer.ts'

const now = Date.now()
const stamp = (ageMs = 3600000) => new Date(now - ageMs).toISOString()
const message = (quotes) => ({ source: 'DolarAPI', success: true, quotes })
const rate = (key = 'bolsa', compra = 1450, venta = 1500, updatedAt = stamp()) => ({
  key, compra, venta, updatedAt,
})
const quote = rate()

const aggregate = (usdCashSavings = null) => ({
  scope: 'spending-forecast',
  historyFrom: '2026-05-01',
  historyThrough: '2026-10-31',
  currencies: {
    ARS: {
      status: 'ok', observedExpenseMonths: 3,
      expense: { baseMonthly: 3059885.31 },
      income: { baseMonthly: 656522.02 },
      incomeObserved: { observedIncomeMonths: 3, totalLastSixMonths: 1969566.06, baseMonthly: 656522.02 },
      possibleMonthlySavings: -2403363.29,
      monthly: ['2026-08', '2026-09', '2026-10'].map((month) => ({
        month, incomeRecords: 1, hasExpenseData: true,
      })),
    },
    USD: usdCashSavings === null ? {
      status: 'insufficient-data', observedExpenseMonths: 0,
      incomeObserved: { observedIncomeMonths: 3, baseMonthly: 5500, totalLastSixMonths: 16500 },
      expense: null, income: null, possibleMonthlySavings: null, monthly: [],
    } : {
      status: 'ok', observedExpenseMonths: 3,
      expense: { baseMonthly: usdCashSavings < 0 ? 5700 : 300 },
      income: { baseMonthly: 5500 },
      incomeObserved: { observedIncomeMonths: 3, baseMonthly: 5500, totalLastSixMonths: 16500 },
      possibleMonthlySavings: usdCashSavings,
      monthly: ['2026-08', '2026-09', '2026-10'].map((month) => ({
        month, incomeRecords: 1, hasExpenseData: true,
      })),
    },
  },
  portfolioBalances: {
    status: 'ok', byCurrency: {
      ARS: { balance: 200000, positionCount: 1 },
      USD: { balance: 110000.5, positionCount: 3 },
    },
  },
  quality: { unclassifiedCount: 0 },
})

test('DolarAPI quote parser accepts only exact market allowlist and valid recent numbers', () => {
  const quotes = parseLiveFxQuotes(message([
    rate('blue', 1400, 1460),
    rate('bolsa'),
    rate('oficial', 1300, 1350),
    rate('fake', 1, 2),
    rate('bolsa', 999, 1000),
    rate('cripto', NaN, 1000),
    rate('cripto', 1000, 0),
  ]), now)
  assert.deepEqual(quotes.map((q) => q.key), ['bolsa', 'oficial', 'blue'])
  assert.equal(fxMarketLabel('bolsa'), 'MEP')
  assert.equal(selectedFxQuote(quotes, 'bolsa', now)?.compra, 1450)
  assert.equal(selectedFxQuote(quotes, 'cripto', now), null)
})

test('stale or absent rates, invalid timestamps, and spoofed origin metadata do not produce equivalences', () => {
  assert.deepEqual(parseLiveFxQuotes(message([rate('bolsa', 1450, 1500, stamp(40 * 3600000))]), now), [])
  assert.deepEqual(parseLiveFxQuotes(message([rate('bolsa', 1450, 1500, 'not a date')]), now), [])
  assert.deepEqual(parseLiveFxQuotes(message([rate('bolsa', 1450, 1500, new Date(now + 3 * 86400000).toISOString())]), now), [])
  assert.deepEqual(parseLiveFxQuotes({ source: 'Other provider', success: true, quotes: [quote] }), [])
  assert.deepEqual(parseLiveFxQuotes({ source: 'DolarAPI', success: false, quotes: [quote] }), [])
  assert.deepEqual(parseLiveFxQuotes({ source: 'DolarAPI', success: true, quotes: [{ ...quote, compra: -5 }] }), [])
  assert.equal(selectedFxQuote([rate('bolsa', 1450, 1500, stamp(40 * 3600000))], 'bolsa', now), null)
})

test('selling USD for ARS uses the BUY price and sums only registered Portfolio positions', () => {
  const answer = formatVerifiedSavingsAnswer(aggregate(), 1, quote)
  assert.match(answer, /Dólar MEP · DolarAPI/)
  assert.match(answer, /Equivalente orientativo de posiciones USD del Portfolio/)
  assert.match(answer, /159\.500\.725,00/)
  assert.match(answer, /Portfolio registrado expresado en ARS/)
  assert.match(answer, /159\.700\.725,00/)
  assert.match(answer, /1\.657,49/)
  assert.match(answer, /precio comprador de hoy/)
  assert.match(answer, /no incluye Bancos/)
  assert.match(answer, /flujo total de ahorro sigue sin poder estimarse/)
  assert.doesNotMatch(answer, /Flujo mensual equivalente de ambas monedas/)
})

test('a positive USD savings flow uses compra while a negative USD flow uses venta', () => {
  const positive = formatVerifiedSavingsAnswer(aggregate(5200), 1, quote)
  assert.match(positive, /Flujo mensual equivalente de ambas monedas/)
  assert.match(positive, /5\.136\.636,71/)
  const negative = formatVerifiedSavingsAnswer(aggregate(-200), 1, quote)
  assert.match(negative, /-\$\s*2\.703\.363,29/)
  assert.match(negative, /USD positivo usa comprador y negativo usa vendedor/)
})

test('no quote or invalid quote never invents conversions or a global surplus', () => {
  const missing = formatVerifiedSavingsAnswer(aggregate(), 1)
  assert.match(missing, /Sin cotización vigente verificada/)
  assert.match(missing, /No hay cotización ni conversión implícita/)
  const invalid = formatVerifiedSavingsAnswer(aggregate(), 1, rate('bolsa', 0, 1500))
  assert.doesNotMatch(invalid, /Equivalente orientativo de posiciones/)
  assert.doesNotMatch(invalid, /1\.657,49/)
  assert.match(missing, /--- DETALLE DEL CÁLCULO ---/)
})

test('LTC-Lita bridge carries only quote IDs, source and validated prices; finance fields stay local', () => {
  const chat = readFileSync(new URL('../src/components/Chat.tsx', import.meta.url), 'utf8')
  const savings = readFileSync(new URL('../src/lib/savingsAnswer.ts', import.meta.url), 'utf8')
  assert.match(chat, /type: 'lita:fx:request', payload: \{ requestId \}/)
  assert.match(chat, /parseLiveFxQuotes\(reply\)/)
  assert.match(chat, /Seleccionar mercado del dólar/)
  assert.match(chat, /Ver detalles del cálculo y supuestos/)
  assert.match(chat, /formatVerifiedSavingsAnswer\(projection, forecast\.months, currentQuote\)/)
  assert.match(savings, /--- DETALLE DEL CÁLCULO ---/)
})
