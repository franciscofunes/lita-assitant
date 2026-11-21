import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  amountsForHorizon, parseSpendingVisualReport, parseCardsVisualReport,
} from '../src/lib/visualReport.ts'

const sample = {
  scope: 'spending-forecast',
  historyThrough: '2026-10-31',
  quality: { unclassifiedCount: 2 },
  currencies: {
    ARS: {
      observedExpenseMonths: 3, missingExpenseMonths: ['2026-06', '2026-07', '2026-08'],
      expense: { lowMonthly: 100, baseMonthly: 233.33, highMonthly: 300 },
      possibleMonthlySavings: -30,
      monthly: [{ month: '2026-10', expense: 300, hasExpenseData: true }],
      topCategories: [{ category: 'Alimentos', projectedMonthly: 83.33 }],
    },
    USD: { observedExpenseMonths: 2, expense: null, topCategories: [] },
  },
}

test('reports consume only provided deterministic values and keep currencies separate', () => {
  const report = parseSpendingVisualReport(sample)
  assert.ok(report)
  assert.equal(report.kind, 'spending')
  assert.equal(report.currencies.length, 1)
  assert.equal(report.currencies[0].currency, 'ARS')
  assert.equal(report.currencies[0].monthlySavings, -30)
  assert.deepEqual(report.currencies[0].categories, [{ name: 'Alimentos', amount: 83.33 }])
  assert.deepEqual(amountsForHorizon(report.currencies[0], 3),
    { low: 300, base: 699.99, high: 900 })
  assert.match(report.quality[1], /2 movimiento/)
  assert.equal(report.through, '2026-10-31')
})

test('invalid or missing financial inputs cannot produce invented report values', () => {
  assert.equal(parseSpendingVisualReport({ scope: 'spending-forecast', currencies: { ARS: { expense: null } } }), null)
  assert.equal(parseSpendingVisualReport({ ...sample, currencies: { ARS: {
    expense: { lowMonthly: 100, baseMonthly: Infinity, highMonthly: 300 },
  } } }), null)
  assert.equal(parseCardsVisualReport({ section: 'banks', privacyHidden: true }), null)
  assert.equal(parseSpendingVisualReport({ ...sample, scope: 'random' }), null)
})

test('card report uses historical paid statements only, with at least three observed months', () => {
  const input = {
    section: 'banks',
    monthlyCardSpending: {
      scope: 'historical-card-statement-expenses-by-transaction-date',
      byCurrency: [{
        currency: 'ARS',
        months: [
          { month: '2026-07', amount: 100, statementCount: 1 },
          { month: '2026-08', amount: 200, statementCount: 1 },
          { month: '2026-09', amount: 300, statementCount: 2 },
        ],
        currentCycleRegisteredAmount: 99999,
      }, { currency: 'USD', months: [{ month: '2026-09', amount: 40, statementCount: 1 }] }],
    },
  }
  const report = parseCardsVisualReport(input)
  assert.ok(report)
  assert.equal(report.kind, 'cards')
  assert.equal(report.currencies.length, 1)
  assert.equal(report.currencies[0].currency, 'ARS')
  assert.equal(report.currencies[0].baseMonthly, 200)
  assert.deepEqual(amountsForHorizon(report.currencies[0], 1), { low: 100, base: 200, high: 300 })
  assert.doesNotMatch(JSON.stringify(report), /99999/)
})

test('report export is local Canvas and browser illustration never sends personal data', () => {
  const source = readFileSync(new URL('../src/lib/visualReport.ts', import.meta.url), 'utf8')
  const chat = readFileSync(new URL('../src/components/Chat.tsx', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../src/components/VisualForecastReport.tsx', import.meta.url), 'utf8')
  assert.match(source, /document\.createElement\('canvas'\)/)
  assert.match(source, /canvas\.toBlob/)
  assert.match(chat, /lita:illustration:request/)
  assert.match(chat, /lita:forecast:request/)
  assert.match(ui, /download=.*\.png/)
  assert.match(ui, /Descargar PNG/)
  assert.match(chat, /privacyHidden === true/)
})
