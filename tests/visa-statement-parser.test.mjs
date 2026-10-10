import assert from 'node:assert/strict'
import test from 'node:test'
import { parseVisaTextPages, sortPdfTextLines, parseSantanderPositionedPurchases, parseSantanderPositionedTotals } from '../src/lib/visaStatementParser.ts'

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


// PDF.js may assign distinct font baselines within a single printed row.
// Test only synthetic records: never check in actual bank PDF text or PII.
test('Santander VISA parses horizontally aligned fragments with near baselines', () => {
  const spans = [
    { text: 'Movimientos de usuario', x: 8, y: 150 },
    { text: 'Fecha Descripción Cuota Comprobante Monto en pesos Monto en dólares', x: 8, y: 136 },
    { text: '01/09/26', x: 8, y: 120 },
    { text: 'Supermercado', x: 70, y: 118 },
    { text: '111111', x: 220, y: 116.8 },
    { text: '100,00 pesos', x: 300, y: 116.8 },
    { text: '02/09/26', x: 8, y: 102 },
    { text: 'Suscripción', x: 70, y: 100 },
    { text: '222222', x: 220, y: 98.8 },
    { text: '20,00 dólares', x: 300, y: 98.8 },
  ]
  const strict = sortPdfTextLines(spans)
  assert.throws(() => parseVisaTextPages([pages[0], strict, ...pages.slice(2)], 'b'.repeat(64)), /UNSUPPORTED_PDF_LAYOUT/)
  const resilient = sortPdfTextLines(spans, 4.5)
  const result = parseVisaTextPages([pages[0], [pages[1][1], ...resilient], ...pages.slice(2)], 'c'.repeat(64))
  assert.equal(result.items.length, 2)
  assert.deepEqual(result.statement.purchases, { ARS: '100.00', USD: '20.00' })
  assert.equal(result.statement.reconciliation.ARS, true)
  assert.ok(result.items.every((item) => item.includeInCashFlow === false))
  const altered = resilient.map((line) => line.replace('100,00 pesos', '101,00 pesos'))
  assert.throws(() => parseVisaTextPages([pages[0], [pages[1][1], ...altered], ...pages.slice(2)], 'd'.repeat(64)), /STATEMENT_RECONCILIATION_FAILED/)
})

// PII-free Santander fixture derived from the published column geometry.
// No original PDF bytes, merchant names, account details or receipt values.
const positioned = [[], [
  { text: 'Movimientos de usuario', x: 42, y: 620 },
  { text: 'Comprobante', x: 299, y: 570 },
  { text: 'Monto en pesos', x: 380, y: 570 },
  { text: 'Monto en dólares', x: 470, y: 570 },
  { text: '01/09/26', x: 45, y: 545 },
  { text: 'Supermercado', x: 104, y: 545 },
  { text: '111111', x: 299, y: 545 },
  { text: '100,00 pesos', x: 410, y: 545 },
  { text: '02/09/26', x: 45, y: 518 },
  { text: 'Suscripción', x: 104, y: 518 },
  { text: '222222', x: 299, y: 518 },
  { text: '20,00 dólares', x: 503, y: 518 },
], [], [], [], []]

test('Santander geometry extracts receipt, amount and currency from separate PDF.js items', () => {
  const items = parseSantanderPositionedPurchases(positioned)
  assert.equal(items.length, 2)
  assert.deepEqual(items.map((row) => row.currency), ['ARS', 'USD'])
  assert.deepEqual(items.map((row) => row.amount), ['100.00', '20.00'])
  assert.equal(items[0].sourcePage, 2)
  assert.ok(items.every((row) => row.includeInCashFlow === false))
  const result = parseVisaTextPages(pages, 'b'.repeat(64), positioned)
  assert.equal(result.items.length, 2)
  assert.equal(result.statement.reconciliation.ARS, true)
  assert.equal(result.statement.reconciliation.USD, true)
})

test('Santander column reconstruction fails closed when its numbers disagree with bank subtotals', () => {
  const bad = positioned.map((rows) => rows.map((item) => ({ ...item })))
  bad[1].find((item) => item.text === '100,00 pesos').text = '101,00 pesos'
  const detected = parseSantanderPositionedPurchases(bad)
  assert.equal(detected.length, 2)
  assert.throws(() => parseVisaTextPages(pages, 'c'.repeat(64), bad), /STATEMENT_RECONCILIATION_FAILED/)
})

test('Santander geometry carries forward purchase date and rejects ambiguous amount columns', () => {
  const noDate = positioned.map((rows) => rows.map((item) => ({ ...item })))
  noDate[1] = noDate[1].filter((item) => item.text !== '02/09/26')
  assert.equal(parseSantanderPositionedPurchases(noDate)[1].date, '2026-09-01')
  noDate[1].push({ text: '1,00 pesos', x: 400, y: 545 })
  assert.equal(parseSantanderPositionedPurchases(noDate).length, 1)
})


test('Santander accepts receipts from fixed columns even if PDF.js splits or omits headings', () => {
  // PDF.js commonly segments "Monto en pesos" into "Monto en" / "pesos".
  const noWholeHeading = positioned.map((rows) => rows.map((span) => ({ ...span })))
  noWholeHeading[1] = noWholeHeading[1]
    .filter((span) => !/Monto en|Movimientos de|Comprobante/.test(span.text))
  assert.equal(parseSantanderPositionedPurchases(noWholeHeading).length, 2)
  const statement = parseVisaTextPages(pages, '2'.repeat(64), noWholeHeading)
  assert.deepEqual(statement.statement.purchases, { ARS: '100.00', USD: '20.00' })
  assert.equal(statement.items.length, 2)
})

test('Santander recognizes an entire multi-page 83-purchase positioned fixture with missing dates', () => {
  const all = Array.from({ length: 8 }, () => [])
  for (let i = 0; i < 83; i++) {
    const page = 1 + Math.floor(i / 18)
    const inPage = i % 18
    const y = page === 1 ? 510 - inPage * 24 : 740 - inPage * 24
    const usd = i >= 81
    const amount = usd ? '1,00 dólares' : '1,00 pesos'
    const x = usd ? 503 : 410
    if (inPage === 0) all[page].push({ text: '01/09/26', x: 45, y })
    all[page].push(
      { text: 'Comercio sintético', x: 104, y },
      { text: String(100000 + i), x: 299.5, y },
      { text: amount, x, y },
    )
  }
  const purchases = parseSantanderPositionedPurchases(all)
  assert.equal(purchases.length, 83)
  assert.equal(purchases.filter((row) => row.currency === 'ARS').length, 81)
  assert.equal(purchases.filter((row) => row.currency === 'USD').length, 2)
  assert.ok(purchases.every((row) => row.includeInCashFlow === false))
})


// All numbers, merchants and receipts in this fixture are deliberately
// synthetic. It models PDF.js returning bank totals as independent text spans
// instead of one concatenated "Subtotal..." or "Total a pagar..." line.
const anchoredSantander = () => {
  const positions = Array.from({ length: 8 }, () => [])
  positions[1] = [
    ...positioned[1].map((span) => ({ ...span })),
    { text: 'Saldo del resumen anterior *', x: 53, y: 398 },
    { text: 'Saldo en pesos. Menos 5,00.', x: 404, y: 398 },
  ]
  positions[5] = [
    { text: 'Subtotal de usuario', x: 103, y: 680 },
    { text: 'Subtotal en pesos. 100,00.', x: 389, y: 680 },
    { text: 'Subtotal en dolares. 20,00.', x: 503, y: 680 },
    { text: 'Db.rg 5617 30% ( 33,33 )', x: 103, y: 568 },
    { text: '10,00 pesos', x: 403, y: 568 },
    { text: 'Total a pagar', x: 54, y: 503 },
    { text: 'Total en pesos. 105,00.', x: 391, y: 503 },
    { text: 'Total en dolares. 20,00.', x: 503, y: 503 },
    { text: 'Mínimo a pagar', x: 54, y: 460 },
    { text: 'Total en pesos. 20,00.', x: 405, y: 460 },
  ]
  return positions
}

test('Santander reads independently positioned ARS, USD, previous credit, VAT and minimum', () => {
  const positions = anchoredSantander()
  assert.deepEqual(parseSantanderPositionedTotals(positions), {
    subtotal: { ARS: 10000, USD: 2000 },
    finalTotal: { ARS: 10500, USD: 2000 },
    taxesArs: 1000,
    previousCreditArs: -500,
    minimumPaymentArs: 2000,
  })
  const fragments = pages.map((page) => [...page])
  // No single flattened line contains the bank's independently printed
  // subtotal/total amounts. This previously failed reconciliation.
  fragments[5] = ['Subtotal de usuario', 'Db.rg 5617 30%', 'Total a pagar', 'Mínimo a pagar']
  const result = parseVisaTextPages(fragments, 'f'.repeat(64), positions)
  assert.equal(result.items.length, 2)
  assert.deepEqual(result.statement.totals, { ARS: '105.00', USD: '20.00' })
  assert.deepEqual(result.statement.purchases, { ARS: '100.00', USD: '20.00' })
  assert.equal(result.statement.previousCreditArs, '-5.00')
  assert.equal(result.statement.taxesArs, '10.00')
  assert.equal(result.statement.minimumPaymentArs, '20.00')
})

test('Santander refuses an altered bank subtotal even when PDF fragments are split', () => {
  const positions = anchoredSantander()
  positions[5][1].text = 'Subtotal en pesos. 101,00.'
  assert.throws(() => parseVisaTextPages(pages, '7'.repeat(64), positions),
    /STATEMENT_RECONCILIATION_FAILED/)
})

test('Santander refuses tampered final balance or missing currency cells', () => {
  const positions = anchoredSantander()
  positions[5][6].text = 'Total en pesos. 106,00.'
  assert.throws(() => parseVisaTextPages(pages, '8'.repeat(64), positions),
    /STATEMENT_RECONCILIATION_FAILED/)
  const missing = anchoredSantander()
  missing[5].splice(2, 1)
  assert.throws(() => parseVisaTextPages(pages, '9'.repeat(64), missing),
    /UNSUPPORTED_PDF_LAYOUT/)
})


test('Santander footer accepts PDF.js split label fragments without bypassing reconciliation', () => {
  const positions = anchoredSantander()
  // PDF.js may split bank labels and amounts across individual font runs
  // with slightly different y origins on the same printed row.
  const footer = positions[5]
  const subtotal = footer.find((s) => s.text.startsWith('Subtotal de'))
  const total = footer.find((s) => s.text === 'Total a pagar')
  const tax = footer.find((s) => s.text.startsWith('Db.rg 5617'))
  positions[5] = footer.filter((s) => s !== subtotal && s !== total && s !== tax)
  positions[5].push(
    { text: 'Subtotal', x: 103, y: 680 },
    { text: 'de titular', x: 163, y: 679 },
    { text: 'Total', x: 54, y: 503 },
    { text: 'a pagar', x: 106, y: 502 },
    { text: 'Db.rg', x: 103, y: 568 },
    { text: '5617 30%', x: 146, y: 567 },
  )
  const prior = positions[1].find((s) => s.text.startsWith('Saldo del resumen anterior'))
  positions[1] = positions[1].filter((s) => s !== prior)
  positions[1].push(
    { text: 'Saldo del', x: 53, y: 398 },
    { text: 'resumen anterior *', x: 105, y: 397 },
  )
  const expected = parseSantanderPositionedTotals(positions)
  assert.deepEqual(expected, {
    subtotal: { ARS: 10000, USD: 2000 },
    finalTotal: { ARS: 10500, USD: 2000 },
    taxesArs: 1000,
    previousCreditArs: -500,
    minimumPaymentArs: 2000,
  })
  const parsed = parseVisaTextPages(pages, 'a'.repeat(64), positions)
  assert.equal(parsed.items.length, 2)
  assert.deepEqual(parsed.statement.reconciliation, { ARS: true, USD: true })
})

test('Santander rejects duplicated or missing currency cells in the footer', () => {
  const positions = anchoredSantander()
  positions[5].push({text: '999,99', x: 420, y: 680})
  assert.throws(
    () => parseVisaTextPages(pages, 'a'.repeat(64), positions),
    /UNSUPPORTED_PDF_LAYOUT/,
  )
  const missing = anchoredSantander()
  missing[5] = missing[5].filter((s) => !/Subtotal en dolares/.test(s.text))
  assert.throws(
    () => parseVisaTextPages(pages, 'a'.repeat(64), missing),
    /UNSUPPORTED_PDF_LAYOUT/,
  )
})


test('Santander prior-credit cell on a different PDF.js baseline is still independently validated', () => {
  const positions = anchoredSantander()
  const printedCredit = positions[1].find((span) => span.text.includes('Saldo en pesos. Menos'))
  assert.ok(printedCredit)
  // Previous code grouped text into one row (8pt tolerance) and discarded the
  // printed bank credit when the right text baseline differed by 13pt.
  printedCredit.y -= 13
  const totals = parseSantanderPositionedTotals(positions)
  assert.equal(totals.previousCreditArs, -500)
  const result = parseVisaTextPages(pages, 'e'.repeat(64), positions)
  assert.equal(result.statement.previousCreditArs, '-5.00')
  assert.deepEqual(result.statement.reconciliation, { ARS: true, USD: true })
})

test('Santander joins separated right-column credit fragments but refuses a wrong amount', () => {
  const positions = anchoredSantander()
  const original = positions[1].find((span) => span.text.includes('Saldo en pesos. Menos'))
  positions[1] = positions[1].filter((span) => span !== original)
  positions[1].push(
    { text: 'Saldo en pesos. Menos', x: 404, y: 387 },
    { text: '5,00.', x: 437, y: 386 },
  )
  const valid = parseVisaTextPages(pages, 'd'.repeat(64), positions)
  assert.equal(valid.statement.previousCreditArs, '-5.00')
  positions[1].find((span) => span.text === '5,00.').text = '6,00.'
  assert.throws(
    () => parseVisaTextPages(pages, 'c'.repeat(64), positions),
    /STATEMENT_RECONCILIATION_FAILED/,
  )
})

test('Santander does not confuse a payment on a neighboring printed row with prior credit', () => {
  const positions = anchoredSantander()
  positions[1] = positions[1].filter((span) => !span.text.includes('Saldo en pesos. Menos'))
  positions[1].push({ text: 'menos 5,00 pesos', x: 403, y: 360 })
  assert.throws(
    () => parseSantanderPositionedTotals(positions),
    /UNSUPPORTED_PDF_LAYOUT/,
  )
})


test('Santander credit uses unique printed label, not arbitrary PDF.js amount coordinates', () => {
  const sample = anchoredSantander()
  const credit = sample[1].find((s) => /Saldo en pesos/.test(s.text))
  assert.ok(credit)
  // PDF.js text-item origin can differ from the visible printed location.
  credit.x = 220
  credit.y -= 30
  // Distractor: another negative amount in the RG-5617 row must be ignored.
  sample[1].push({ text: 'menos 5,00 pesos', x: 404, y: 443 })
  const parsed = parseVisaTextPages(pages, 'e'.repeat(64), sample)
  assert.equal(parsed.statement.previousCreditArs, '-5.00')
  assert.deepEqual(parsed.statement.reconciliation, { ARS: true, USD: true })
})

test('Santander prior credit accepts label/amount fragments, including split semantic heading', () => {
  const sample = anchoredSantander()
  sample[1] = sample[1].filter((s) => !/Saldo en pesos/.test(s.text))
  sample[1].push(
    { text: 'Saldo en', x: 404, y: 398 },
    { text: 'pesos.', x: 432, y: 397 },
    { text: 'Menos', x: 456, y: 398 },
    { text: '5,00.', x: 478, y: 397 },
  )
  const result = parseVisaTextPages(pages, 'd'.repeat(64), sample)
  assert.equal(result.statement.previousCreditArs, '-5.00')
  sample[1].find((s) => s.text === '5,00.').text = '6,00.'
  assert.throws(() => parseVisaTextPages(pages, 'c'.repeat(64), sample),
    /STATEMENT_RECONCILIATION_FAILED/)
})

test('Santander fails closed without a uniquely labelled bank credit, even with matching nearby negative amounts', () => {
  const noCredit = anchoredSantander()
  noCredit[1] = noCredit[1].filter((s) => !/Saldo en pesos/.test(s.text))
  noCredit[1].push({ text: 'menos 5,00 pesos', x: 403, y: 397 })
  assert.throws(() => parseSantanderPositionedTotals(noCredit), /UNSUPPORTED_PDF_LAYOUT/)

  const duplicate = anchoredSantander()
  duplicate[1].push({text: 'Saldo en pesos. Menos 5,00.', x: 504, y: 350})
  assert.throws(() => parseSantanderPositionedTotals(duplicate), /UNSUPPORTED_PDF_LAYOUT/)
})
