import test from 'node:test'
import assert from 'node:assert/strict'
import { isSupportedLtcFinancialSection, SUPPORTED_LTC_FINANCIAL_SECTIONS } from '../src/lib/financialSections.ts'
import { assessFinancialScope } from '../src/lib/financialScope.ts'

test('bank financial context is recognized without changing existing Portfolio and Transactions support', () => {
  assert.deepEqual([...SUPPORTED_LTC_FINANCIAL_SECTIONS], ['transactions', 'portfolio', 'banks'])
  for (const section of ['banks', 'transactions', 'portfolio'])
    assert.equal(isSupportedLtcFinancialSection(section), true)
})
test('unknown, off-topic, malformed or prototype section values remain rejected', () => {
  for (const section of ['admin', 'general', 'bank', '', 'banks-admin', null, undefined, {}, 42])
    assert.equal(isSupportedLtcFinancialSection(section), false)
})
test('bank balances, card charges and bill due dates are within financial scope', () => {
  for (const question of [
    '¿Cuál es el saldo de mis bancos?',
    '¿Qué tarjetas tienen vencimientos?',
    'Analizá mis cuentas bancarias por moneda',
  ]) assert.equal(assessFinancialScope(question), 'allowed', question)
  assert.equal(assessFinancialScope('Dame código Python'), 'denied')
})
