import test from 'node:test'
import assert from 'node:assert/strict'
import { assessFinancialScope } from '../src/lib/financialScope.ts'
import { requestedFinancialPeriod } from '../src/lib/financialPeriods.ts'

test('rejects non-financial programming and general-topic questions', () => {
  for (const question of [
    'Javascript número primo cómo',
    'Dame una función en JavaScript para calcular una tasa',
    'Explicá un algoritmo en typescript',
    '¿Cómo cocinar una receta?',
    'Qué es un número primo?',
    'Quiero un poema sobre dólares',
  ]) assert.equal(assessFinancialScope(question), 'denied', question)
})

test('allows specific personal finance questions', () => {
  for (const question of [
    '¿Cuál fue la mayor venta de divisas de septiembre 2026?',
    '¿En qué se me está yendo más dinero?',
    'Resumí mis movimientos actuales',
    'Analizá mi balance del período',
    '¿Qué cuenta remunerada tiene mayor tasa?',
    '¿Cuánto gasté en tarjeta durante el año 2025?',
    '¿Cómo se distribuyen mis inversiones?',
    '¿Retiré 800 USD de AstroPay?',
  ]) assert.equal(assessFinancialScope(question), 'allowed', question)
})

test('allows greetings and rejects malformed requests', () => {
  assert.equal(assessFinancialScope('hola'), 'greeting')
  assert.equal(assessFinancialScope(''), 'denied')
  assert.equal(assessFinancialScope('a'.repeat(2000)), 'denied')
  assert.equal(assessFinancialScope({}), 'denied')
})

test('recognizes September 2026', () => {
  const period = requestedFinancialPeriod(
    'Puedes analizar del mes de septiembre del año 2026 la operación de mayor venta de divisas',
    new Date(2026, 9, 9),
  )
  assert.deepEqual(period, { from: '2026-09-01', to: '2026-09-30', label: 'septiembre 2026' })
})

test('recognizes years and rolling months without querying the future', () => {
  const now = new Date(2026, 9, 9)
  assert.deepEqual(requestedFinancialPeriod('Gastos del año 2025', now), {
    from: '2025-01-01', to: '2025-12-31', label: '2025',
  })
  assert.deepEqual(requestedFinancialPeriod('Balance 2026', now), {
    from: '2026-01-01', to: '2026-10-09', label: '2026',
  })
  assert.deepEqual(requestedFinancialPeriod('Ventas de divisas últimos 3 meses', now), {
    from: '2026-08-01', to: '2026-10-09', label: 'Últimos 3 meses',
  })
  assert.equal(requestedFinancialPeriod('Cuánto gasté?', now), null)
  assert.equal(requestedFinancialPeriod('Gastos en 2040', now), null)
})
