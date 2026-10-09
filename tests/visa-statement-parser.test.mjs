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


// Synthetic, PII-free rendering of a separate Banco Ciudad Visa layout.
// All figures match the source document's reconciled totals but no name,
// card/account number, address or private receipt/policy identifier is stored.
const ciudadPages = [
  [
    'VISA GOLD 1/2 PAGINA:', 'CIERRE ACTUAL: 01 Oct 26',
    'VENCIMIENTO SALDO $ SALDO U$S PAGO MIN.$ PAGO MIN.U$S',
    'DOMICILIO OMITIDO 13 Oct 26 220.356,40 0,00 83.760,00 -,--',
    'FECHA COMPROBANTE DETALLE DE TRANSACCION PESOS DOLARES',
    'SALDO ANTERIOR 224.435,04 0,00',
    '07.09.26 SU PAGO EN PESOS 224.435,04- _',
    '14.05.25 000001* COMERCIO A Cuota 17/18 49.491,05',
    '23.12.25 000002* COMERCIO B Cuota 10/10 8.670,00',
    '15.08.26 000003* COMERCIO C Cuota 02/18 2.994,38',
    '24.09.26 000004* ASEGURADORA000000000000000-000-000 16.093,80',
    '24.09.26 000005* ASEGURADORA000000000000001-000-000 135.680,17',
    'Tarjeta **** Total Consumos de TITULAR OMITIDO 212.929,40 0,00 _',
    '01.10.26 DB IVA $ 21% 6.138,02 1.288,98',
    '01.10.26 COM.ADM.Y LIQ.DE CUENTA 6.138,02',
    'SALDO ACTUAL $ 220.356,40',
    'PAGO MINIMO $ 83.760,00',
    'Consultas en www.bancociudad.com.ar',
  ],
  ['PAGINA 2/2', 'Condiciones y financiación de tarjetas VISA'],
];

test('Banco Ciudad Visa Gold: 5 consumos, installments, fee + IVA reconciled separately', () => {
  const data = parseVisaTextPages(ciudadPages, 'd'.repeat(64))
  assert.equal(data.statement.institution, 'Banco Ciudad')
  assert.equal(data.statement.closingDate, '2026-10-01')
  assert.equal(data.statement.dueDate, '2026-10-13')
  assert.deepEqual(data.statement.totals, { ARS: '220356.40', USD: '0.00' })
  assert.deepEqual(data.statement.purchases, { ARS: '212929.40', USD: '0.00' })
  assert.equal(data.statement.minimumPaymentArs, '83760.00')
  assert.equal(data.statement.taxesArs, '1288.98')
  assert.equal(data.statement.feesArs, '6138.02')
  assert.equal(data.statement.previousCreditArs, '0.00')
  assert.equal(data.items.length, 5)
  assert.equal(data.items.filter((item) => item.installment).length, 3)
  assert.equal(data.items[0].installment, '17/18')
  assert.equal(data.items[2].installment, '02/18')
  assert.ok(data.items.every((item) => item.currency === 'ARS' && item.includeInCashFlow === false))
  assert.ok(data.items.every((item) => !/\d{7,}/.test(item.merchant)))
  assert.equal(data.items[3].merchant, 'ASEGURADORA')
})

test('Banco Ciudad rejects altered purchase or missing fee/IVA reconciliation', () => {
  const changedPurchase = ciudadPages.map((rows) => [...rows])
  changedPurchase[0][7] = changedPurchase[0][7].replace('49.491,05', '49.491,06')
  assert.throws(() => parseVisaTextPages(changedPurchase, 'e'.repeat(64)), /STATEMENT_RECONCILIATION_FAILED/)
  const changedTax = ciudadPages.map((rows) => [...rows])
  changedTax[0][13] = changedTax[0][13].replace('1.288,98', '1.288,99')
  assert.throws(() => parseVisaTextPages(changedTax, 'e'.repeat(64)), /STATEMENT_RECONCILIATION_FAILED/)
})

test('Banco Ciudad does not silently assign USD purchases to ARS without column proof', () => {
  const usd = ciudadPages.map((rows) => [...rows])
  usd[0][12] = usd[0][12].replace('0,00 _', '12,00 _')
  assert.throws(() => parseVisaTextPages(usd, 'f'.repeat(64)), /UNSUPPORTED_PDF_LAYOUT/)
})

test('Santander Visa synthetic parser stays compatible after bank dispatch', () => {
  const extracted = parseVisaTextPages(pages, '1'.repeat(64))
  assert.equal(extracted.statement.institution, 'Santander')
  assert.equal(extracted.items.length, 2)
})
