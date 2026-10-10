import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTransactionMarkdown, kindForCategory, normalizeAmount,
  questionsForCategory, validateWizardAnswer,
} from '../src/lib/transactionMarkdownWizard.ts'

test('regular expense requires amount but never asks for a USD quantity', () => {
  assert.deepEqual(questionsForCategory('Alimentación 🍜'), ['category','name','amount','date','comment'])
  assert.match(buildTransactionMarkdown({
    category: 'Alimentación 🍜', name: 'Supermercado', amount: '35.079,00',
    date: '2026-10-10', comment: 'Compra semanal',
  }), /  amount: 35079\n/)
})

test('divisas sale generates exact fields of LTC current parser with actual ARS proceeds', () => {
  const value = buildTransactionMarkdown({
    category: 'Venta divisas 💸', name: 'Astropay', institution: 'AstroPay',
    currencyQuantity: '145.51', currencyExchangeRate: '1580.64',
    amount: '229999.98', date: '2026-10-09',
  })
  assert.match(value,/  currencyQuantity: 145.51\n/)
  assert.match(value,/  currencyExchangeRate: 1580.64\n/)
  assert.match(value,/  amount: 229999.98\n/)
  assert.match(value,/  institution: AstroPay\n/)
})

test('exchange computes pesos only when actual value was not provided', () => {
  const value = buildTransactionMarkdown({
    category: 'Compra divisas', name: 'Cambio de USD', institution: 'Banco',
    currencyQuantity: '100', currencyExchangeRate: '1580,64', date: '2026-10-10',
  })
  assert.match(value, /  amount: 158064.00\n/)
})

test('statement includes both dates and avoids duplicate purchase expenses', () => {
  const value = buildTransactionMarkdown({
    category: 'Resumen tarjeta 💳', name: 'Visa banco', amount: '1590805.54',
    date: '2026-10-13', selectedCloseDate: '2026-09-30',
  })
  assert.match(value, /  selectedExpirationDate: 2026-10-13\n/)
  assert.match(value, /  selectedCloseDate: 2026-09-30\n/)
  assert.doesNotMatch(value, /currencyQuantity:/)
})

test('validates dates, rejects invalid amounts and never invents values', () => {
  assert.equal(kindForCategory('Ingreso divisas'), 'currency-income')
  assert.equal(normalizeAmount('1.579,50'), 1579.5)
  assert.equal(normalizeAmount(''), null)
  assert.ok(validateWizardAnswer('date', '2026-02-30'))
  assert.ok(validateWizardAnswer('amount', '0', 'Transporte'))
  assert.throws(() => buildTransactionMarkdown({
    category: 'Transporte', name: 'Uber', date: '2026-10-10',
  }))
})

test('sanitizes line breaks so answers cannot inject additional Markdown transactions', () => {
  const md = buildTransactionMarkdown({
    category: 'Transporte', name: 'Viaje\n- name: Otro', amount: '500',
    date: '2026-10-10',
  })
  assert.equal(md.split('\n- name:').length, 2)
  assert.match(md, /name: Viaje - name: Otro/)
})
