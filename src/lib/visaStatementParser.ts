export type CardLine = {
  date: string
  merchant: string
  currency: 'ARS' | 'USD'
  amount: string
  receipt: string
  installment: string | null
  sourcePage: number
  type: 'purchase'
  includeInCashFlow: false
}
export type StatementExtraction = {
  schema: 'ltc.card-statement.v1'
  fileSha256: string
  statement: {
    cardBrand: 'Visa'
    institution: string
    closingDate: string
    dueDate: string
    period: string
    totals: { ARS: string; USD: string }
    purchases: { ARS: string; USD: string }
    minimumPaymentArs: string
    previousCreditArs: string
    taxesArs: string
    reconciliation: { ARS: boolean; USD: boolean }
  }
  items: CardLine[]
  warnings: string[]
  sourcePages: number
}

type Positioned = { text: string; x: number; y: number }
type PdfPage = { getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[] }> }> }
type PdfDocument = { numPages: number; getPage: (number: number) => Promise<PdfPage>; destroy: () => Promise<void> }

const money = /(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*(pesos|d[oó]lares)/i
const decimal = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100)
const fixed = (n: number) => (n / 100).toFixed(2)
const iso = (date: string): string => {
  const parts = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(date)
  if (!parts) return ''
  const day = Number(parts[1]); const month = Number(parts[2]); const year = Number('20' + parts[3])
  const verified = new Date(Date.UTC(year, month - 1, day))
  if (verified.getUTCDate() !== day || verified.getUTCMonth() + 1 !== month) return ''
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
}
const extractMoney = (raw: string) => {
  const found = money.exec(raw)
  return found ? { cents: cents(decimal(found[1])), currency: /pesos/i.test(found[2]) ? 'ARS' : 'USD' } : null
}
const normalize = (raw: string) => raw.replace(/\s+/g, ' ').trim()
export const sortPdfTextLines = (items: Positioned[]) => {
  const sorted = items.filter((x) => x.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Array<{ y: number; segments: Positioned[] }> = []
  for (const item of sorted) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(last.y - item.y) <= 2.2) last.segments.push(item)
    else rows.push({ y: item.y, segments: [item] })
  }
  return rows.map((row) => normalize(row.segments.sort((a, b) => a.x - b.x)
    .map((x) => x.text).join(' ')))
}

/**
 * This deterministic adapter deliberately supports the uploaded Visa layout.
 * Unknown/scanned layouts fail closed rather than hallucinating line items.
 * Individual purchase values always remain excluded from LTC cash-flow totals.
 */
export function parseVisaTextPages(pages: string[][], fileSha256: string): StatementExtraction {
  if (pages.length < 2 || !pages[0].some((line) => /Resumen Visa/i.test(line))) {
    throw new Error('UNSUPPORTED_PDF_LAYOUT')
  }
  const firstPage = pages[0].join(' ')
  const allDates = [...firstPage.matchAll(/\b\d{2}\/\d{2}\/\d{2}\b/g)].map((match) => match[0])
  if (allDates.length < 6) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const close = iso(allDates[2]); const due = iso(allDates[3])
  const title = pages[0].find((line) => /Total a pagar/i.test(line))
  const fullText = pages.flat().join(' ')
  // Header totals are intentionally checked against the closing summary.
  const totalsLine = pages[pages.length > 5 ? 5 : pages.length - 1]
    .find((line) => /Total a pagar/i.test(line) && /Total en pesos/i.test(line))
  const totalArs = totalsLine
    ? /Total en pesos\D*([\d.]+,\d{2})/i.exec(totalsLine)?.[1]
    : /Total a pagar.{0,300}?([\d.]+,\d{2})/i.exec(firstPage)?.[1]
  const totalUsd = totalsLine
    ? /Total en d[oó]lares\D*([\d.]+,\d{2})/i.exec(totalsLine)?.[1]
    : /U\$S\s*([\d.]+,\d{2})/i.exec(firstPage)?.[1]
  if (!totalArs || !totalUsd || !close || !due) throw new Error('UNSUPPORTED_PDF_LAYOUT')

  const parsed: CardLine[] = []
  let lastDate = ''
  let reading = false
  for (let page = 1; page < Math.min(pages.length, 7); page++) {
    for (const line of pages[page]) {
      if (/^Movimientos de\b/i.test(line) || (page >= 2 && /^Fecha\s+Descripci[oó]n\s+Cuota\b/i.test(line))) {
        reading = true
        continue
      }
      if (/^Subtotal de\b/i.test(line) || /^Impuestos, intereses y percepciones/i.test(line)) {
        reading = false
        break
      }
      if (!reading || /^Fecha\s+Descripci[oó]n/i.test(line)) continue
      let value = line
      const date = /^(\d{2}\/\d{2}\/\d{2})\s+/.exec(value)
      if (date) {
        lastDate = iso(date[1])
        value = value.slice(date[0].length)
      }
      const amount = extractMoney(value)
      if (!amount || !lastDate) continue
      const receipt = /\b(\d{6})\s+(-?[\d.,]+\s*(?:pesos|d[oó]lares))\s*$/i.exec(value)
      if (!receipt) continue
      const description = normalize(value.slice(0, receipt.index))
      const installment = /(\d{1,2}\s+de\s+\d{1,2})$/i.exec(description)
      const merchant = normalize(installment ? description.slice(0, installment.index) : description)
      if (!merchant || merchant.length > 90 || !/^[0-9]{6}$/.test(receipt[1])) continue
      parsed.push({
        date: lastDate, merchant, currency: amount.currency,
        amount: fixed(amount.cents), receipt: receipt[1],
        installment: installment ? installment[1].replace(/\s+/g, ' ') : null,
        sourcePage: page + 1, type: 'purchase', includeInCashFlow: false,
      })
    }
  }
  if (!parsed.length || parsed.length > 400) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const subtotal = { ARS: 0, USD: 0 }
  for (const item of parsed) subtotal[item.currency] += cents(Number(item.amount))
  const purchaseTotalMatch = /Total consumido\s+([\d.]+,\d{2})\s+pesos[,\s]+([\d.]+,\d{2})\s+d[oó]lares/i.exec(fullText)
  // Use the bank's published purchase subtotal as the independent check.
  const expectedArs = purchaseTotalMatch ? cents(decimal(purchaseTotalMatch[1])) : NaN
  const expectedUsd = purchaseTotalMatch ? cents(decimal(purchaseTotalMatch[2])) : NaN
  if (!Number.isFinite(expectedArs) || !Number.isFinite(expectedUsd) ||
    expectedArs !== subtotal.ARS || expectedUsd !== subtotal.USD) {
    throw new Error('STATEMENT_RECONCILIATION_FAILED')
  }
  const taxLine = pages.flat().find((l) => /Db\.rg\s*5617/i.test(l))
  const tax = taxLine ? extractMoney(taxLine) : null
  const previousCredit = /Saldo del resumen anterior[\s\S]{0,160}?Menos\s*([\d.]+,\d{2})/i.exec(fullText)
  const previous = previousCredit ? -cents(decimal(previousCredit[1])) : 0
  const taxes = tax?.currency === 'ARS' ? tax.cents : 0
  const totalArsCents = cents(decimal(totalArs))
  const totalUsdCents = cents(decimal(totalUsd))
  if (totalArsCents !== subtotal.ARS + previous + taxes || totalUsdCents !== subtotal.USD) {
    throw new Error('STATEMENT_RECONCILIATION_FAILED')
  }
  const minLine = pages.flat().find((l) => /M[ií]nimo a pagar.*Total en pesos/i.test(l))
  const minimum = minLine ? /Total en pesos\D*([\d.]+,\d{2})/i.exec(minLine)?.[1] : null
  return {
    schema: 'ltc.card-statement.v1',
    fileSha256,
    statement: {
      cardBrand: 'Visa', institution: 'Santander',
      closingDate: close, dueDate: due, period: close.slice(0, 7),
      totals: { ARS: fixed(totalArsCents), USD: fixed(totalUsdCents) },
      purchases: { ARS: fixed(subtotal.ARS), USD: fixed(subtotal.USD) },
      minimumPaymentArs: minimum ? fixed(cents(decimal(minimum))) : '0.00',
      previousCreditArs: fixed(previous), taxesArs: fixed(taxes),
      reconciliation: { ARS: true, USD: true },
    },
    items: parsed,
    warnings: [
      'Revisá los importes y categorías antes de guardar.',
      'Los consumos son detalles del resumen y NO se agregan de nuevo al flujo de gastos de LTC.',
      'Los consumos USD se mantienen separados; no se inventa una cotización.',
      'No se guarda el PDF ni números completos de cuenta o tarjeta.',
    ],
    sourcePages: pages.length,
  }
}

export async function extractVisaStatement(bytes: Uint8Array, sha: string): Promise<StatementExtraction> {
  // Loaded only at request time; no browser PDF worker or canvas.
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
  const loading = pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: false })
  const pdf = await loading.promise as PdfDocument
  try {
    if (pdf.numPages < 2 || pdf.numPages > 12) throw new Error('UNSUPPORTED_PDF_LENGTH')
    const pages: string[][] = []
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      const positioned: Positioned[] = content.items
        .filter((item) => typeof item.str === 'string' && Array.isArray(item.transform))
        .map((item) => ({ text: String(item.str), x: item.transform![4], y: item.transform![5] }))
      pages.push(sortPdfTextLines(positioned))
    }
    return parseVisaTextPages(pages, sha)
  } finally {
    await pdf.destroy()
  }
}
