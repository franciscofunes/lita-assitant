import test from 'node:test'
import assert from 'node:assert/strict'
import { requestedSpendingForecast } from '../src/lib/spendingForecast.ts'
import { requestedFinancialPeriod } from '../src/lib/financialPeriods.ts'
import { assessFinancialScope } from '../src/lib/financialScope.ts'

test('future intent requests do not become historical lookups', () => {
  for (const [question, months] of [
    ['¿Cuánto voy a gastar el próximo mes?', 1],
    ['¿Cuánto gastaré en los próximos 3 meses?', 3],
    ['Proyección de gastos de los próximos 6 meses', 6],
    ['¿Cuánto podría ahorrar si mantengo este ritmo?', 1],
    ['¿En qué categorías probablemente gastaré más?', 1],
    ['Simulá escenarios de gastos si reduzco mis gastos un 15%', 1],
  ]) {
    assert.deepEqual(requestedSpendingForecast(question), { months }, question)
    assert.equal(assessFinancialScope(question), 'allowed', question)
  }
  assert.equal(requestedSpendingForecast('Gastos de los últimos 3 meses'), null)
  assert.deepEqual(requestedFinancialPeriod('Gastos de los últimos 3 meses',new Date(2026,10,21)),
    { from:'2026-09-01',to:'2026-11-21', label:'Últimos 3 meses' })
})
test('unsupported horizons and historic-only requests do not invent a forecast', () => {
  assert.equal(requestedSpendingForecast('¿Cuánto gasté en octubre 2026?'), null)
  assert.equal(requestedSpendingForecast('Proyección de gastos de los próximos 12 meses'), null)
  assert.equal(requestedSpendingForecast('¿Cuánto gastaré en los próximos 0 meses?'), null)
})
