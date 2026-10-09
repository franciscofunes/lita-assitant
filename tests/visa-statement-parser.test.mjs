import assert from 'node:assert/strict'
import test from 'node:test'
import { parseVisaTextPages } from '../src/lib/visaStatementParser.ts'

const pages = [
  ['Resumen Visa', 'Total a pagar', 'Cierre anterior Vencimiento anterior Cierre actual Vencimiento actual Próximo cierre Próximo vencimiento',
   '27/08/26 04/09/26 01/10/26 09/10/26 29/10/26 11/11/26'],
  ['Total consumido', 'Saldo del resumen anterior * Saldo en pesos. Menos 5,00.',
   'Movimientos de usuario', 'Fecha Descripción Cuota Comprobante Monto en pesos Monto en dólares',
   '01/09/26 Supermercado 111111 100,00 pesos', '02/09/26 Suscripción 222222 20,00 dólares'],
  ['Fecha Descripción Cuota Comprobante Monto en pesos Monto en dólares'],
  ['Fecha Descripción Cuota Comprobante Monto en pesos Monto en dólares'],
  ['Fecha Descripción Cuota Comprobante Monto en pesos Monto en dólares'],
  ['Fecha Descripción Cuota Comprobante Monto en pesos Monto en dólares',
   'Subtotal de usuario Subtotal en pesos. 100,00. Subtotal en dolares. 20,00.',
   'Impuestos, intereses y percepciones', 'Db.rg 5617 30% 10,00 pesos',
   'Total a pagar Total en pesos. 105,00. Total en dolares. 20,00.',
   'Mínimo a pagar Total en pesos. 20,00.'],
]
test('Visa statement is reconciled per currency without turning purchases into expenses', () => {
  const extraction = parseVisaTextPages(pages, 'a'.repeat(64))
  assert.equal(extraction.statement.totals.ARS, '105.00')
  assert.equal(extraction.statement.totals.USD, '20.00')
  assert.equal(extraction.statement.closingDate, '2026-10-01')
  assert.equal(extraction.statement.dueDate, '2026-10-09')
  assert.equal(extraction.items.length, 2)
  assert.ok(extraction.items.every((item) => item.includeInCashFlow === false))
  assert.equal(extraction.items[1].currency, 'USD')
  assert.equal(extraction.statement.reconciliation.ARS, true)
})
test('misbalanced Visa PDF fails closed', () => {
  const broken = pages.map((rows) => [...rows])
  broken[5][1] = broken[5][1].replace('100,00', '101,00')
  assert.throws(() => parseVisaTextPages(broken, 'b'.repeat(64)), /STATEMENT_RECONCILIATION_FAILED/)
})
test('unknown bank format is not hallucinated', () => {
  assert.throws(() => parseVisaTextPages([['Resumen MasterCard'], ['123']], 'c'.repeat(64)), /UNSUPPORTED_PDF_LAYOUT/)
})
