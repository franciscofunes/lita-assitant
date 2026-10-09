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
    feesArs?: string
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
const extractMoney = (raw: string): { cents: number; currency: 'ARS' | 'USD' } | null => {
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

// Banco Ciudad support lives in the same module so Node's native TS test
// runner and the existing Next.js compiler resolve the parser identically.
const decimalCents = (value: string): number => {
  if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(value)) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const normalized = value.replace(/\./g, '').replace(',', '.')
  return Math.round(Number(normalized) * 100)
}
const amount = (cents: number) => (cents / 100).toFixed(2)
const cityNormalize = (raw: string) => raw.replace(/\s+/g, ' ').trim()
const months: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
}
const validDate = (year: number, month: number, day: number): string => {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    throw new Error('UNSUPPORTED_PDF_LAYOUT')
  }
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
}
const shortDate = (day: string, month: string, year: string) =>
  validDate(2000 + Number(year), Number(month), Number(day))
const bankDate = (date: string): string => {
  const match = /(\d{1,2})\s+(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)\s+(\d{2})\b/i.exec(date)
  if (!match) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  return validDate(2000 + Number(match[3]), months[match[2].toLowerCase()], Number(match[1]))
}
/** Parser selected by the bank's header, not merely by "Visa".
 * This adapter handles Banco Ciudad's 2-page digital Visa Gold statement.
 * Unsupported currencies / inconsistent numbers MUST fail closed.
 */
function parseBancoCiudadVisaTextPages(pages: string[][], fileSha256: string): StatementExtraction {
  const lines = pages[0] || []
  if (pages.length !== 2 || !lines.some((line) => /\bVISA GOLD\b/i.test(line)) ||
      !lines.some((line) => /\bCIERRE ACTUAL:/i.test(line)) ||
      !pages.flat().some((line) => /bancociudad\.com\.ar/i.test(line))) {
    throw new Error('UNSUPPORTED_PDF_LAYOUT')
  }

  const closingLine = lines.find((line) => /CIERRE ACTUAL:/i.test(line)) || ''
  const closing = bankDate(closingLine)
  const dueHeadingIndex = lines.findIndex((line) => /VENCIMIENTO\s+SALDO\s+\$/i.test(line))
  if (dueHeadingIndex < 0) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const dueLine = lines.slice(dueHeadingIndex + 1, dueHeadingIndex + 4)
    .find((line) => /\b\d{1,2}\s+(?:Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)\s+\d{2}\b/i.test(line))
  if (!dueLine) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const due = bankDate(dueLine)
  const header = /(\d{1,2}\s+[A-Za-z]{3}\s+\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/i.exec(dueLine)
  if (!header || bankDate(header[1]) !== due) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const headerArs = decimalCents(header[2])
  const headerUsd = decimalCents(header[3])
  const headerMinimum = decimalCents(header[4])

  const start = lines.findIndex((line) => /FECHA\s+COMPROBANTE\s+DETALLE DE TRANSACCION/i.test(line))
  const end = lines.findIndex((line, index) => index > start && /Total Consumos de\b/i.test(line))
  if (start < 0 || end <= start) throw new Error('UNSUPPORTED_PDF_LAYOUT')

  const items: CardLine[] = []
  const totals = { ARS: 0, USD: 0 }
  let priorBalance: number | null = null
  let payment: number | null = null
  for (const line of lines.slice(start + 1, end)) {
    const balance = /\bSALDO ANTERIOR\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/i.exec(line)
    if (balance) {
      priorBalance = decimalCents(balance[1])
      if (decimalCents(balance[2]) !== 0) throw new Error('UNSUPPORTED_PDF_LAYOUT')
      continue
    }
    const paid = /\bSU PAGO EN PESOS\s+([\d.]+,\d{2})-/i.exec(line)
    if (paid) {
      payment = -decimalCents(paid[1])
      continue
    }
    const purchase = /^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{6})\*\s+(.+?)\s+([\d.]+,\d{2})\s*$/i.exec(line)
    if (!purchase) {
      if (/^\d{2}\.\d{2}\.\d{2}\s+\d{6}\*/.test(line)) throw new Error('UNSUPPORTED_PDF_LAYOUT')
      continue
    }
    const purchaseDate = shortDate(purchase[1], purchase[2], purchase[3])
    const installment = /\bCuota\s+(\d{1,2})\/(\d{1,2})\b/i.exec(purchase[5])
    // Policy numbers and other embedded identifiers aren't necessary for
    // spending categories. Never return them to LTC/Firestore.
    const merchant = cityNormalize(
      purchase[5].replace(/\bCuota\s+\d{1,2}\/\d{1,2}\b/ig, '')
        .replace(/(?:\d{7,}[-\d]*)/g, '').replace(/[0-9-]{5,}$/g, ''),
    )
    if (!merchant || merchant.length > 90) throw new Error('UNSUPPORTED_PDF_LAYOUT')
    const arscents = decimalCents(purchase[6])
    if (arscents <= 0) throw new Error('UNSUPPORTED_PDF_LAYOUT')
    totals.ARS += arscents
    items.push({
      date: purchaseDate, merchant, currency: 'ARS', amount: amount(arscents),
      receipt: purchase[4], installment: installment ? installment[1] + '/' + installment[2] : null,
      sourcePage: 1, type: 'purchase', includeInCashFlow: false,
    })
  }
  if (!items.length || items.length > 400 || priorBalance === null || payment === null) {
    throw new Error('UNSUPPORTED_PDF_LAYOUT')
  }
  if (priorBalance + payment !== 0) {
    // Additional outstanding balance/past payment scenarios need an
    // explicitly reviewed extension, not fabricated "previous credit".
    throw new Error('STATEMENT_RECONCILIATION_FAILED')
  }

  const subtotalLine = lines[end]
  const subtotalMatch = /Total Consumos de\b.*?\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})(?:\s|$)/i.exec(subtotalLine)
  if (!subtotalMatch) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const publishedPurchaseArs = decimalCents(subtotalMatch[1])
  const publishedPurchaseUsd = decimalCents(subtotalMatch[2])
  // Column positions would be required to disambiguate non-zero USD
  // purchases in this bank layout. Refuse them until a USD example is tested.
  if (publishedPurchaseUsd !== 0 || headerUsd !== 0) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  if (publishedPurchaseArs !== totals.ARS) throw new Error('STATEMENT_RECONCILIATION_FAILED')

  const vatLine = lines.find((line) => /\bDB IVA \$\s*21%/i.test(line))
  const feeLine = lines.find((line) => /\bCOM\.ADM\.Y\s+LIQ\.DE\s+CUENTA/i.test(line))
  const balanceLine = lines.find((line) => /\bSALDO ACTUAL\b/i.test(line))
  const minimumLine = lines.find((line) => /\bPAGO MINIMO\b/i.test(line))
  const vatMatch = vatLine && /\bDB IVA \$\s*21%\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/i.exec(vatLine)
  const feeMatch = feeLine && /([\d.]+,\d{2})\s*$/.exec(feeLine)
  const balanceMatch = balanceLine && /SALDO ACTUAL\s+\$\s*([\d.]+,\d{2})/i.exec(balanceLine)
  const minimumMatch = minimumLine && /PAGO MINIMO\s+\$\s*([\d.]+,\d{2})/i.exec(minimumLine)
  if (!vatMatch || !feeMatch || !balanceMatch || !minimumMatch) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const feesArs = decimalCents(feeMatch[1])
  const vatBaseArs = decimalCents(vatMatch[1])
  const taxesArs = decimalCents(vatMatch[2])
  const publishedTotalArs = decimalCents(balanceMatch[1])
  const publishedMinimum = decimalCents(minimumMatch[1])
  if (vatBaseArs !== feesArs || publishedTotalArs !== headerArs ||
      publishedMinimum !== headerMinimum ||
      publishedTotalArs !== totals.ARS + feesArs + taxesArs) {
    throw new Error('STATEMENT_RECONCILIATION_FAILED')
  }

  return {
    schema: 'ltc.card-statement.v1', fileSha256,
    statement: {
      cardBrand: 'Visa', institution: 'Banco Ciudad',
      closingDate: closing, dueDate: due, period: closing.slice(0, 7),
      totals: { ARS: amount(publishedTotalArs), USD: amount(0) },
      purchases: { ARS: amount(totals.ARS), USD: amount(0) },
      minimumPaymentArs: amount(publishedMinimum), previousCreditArs: amount(0),
      taxesArs: amount(taxesArs), feesArs: amount(feesArs),
      reconciliation: { ARS: true, USD: true },
    },
    items,
    sourcePages: pages.length,
    warnings: [
      'Banco Ciudad: el saldo anterior quedó cancelado por el pago; no representa una compra nueva.',
      'Se separan comisión administrativa e IVA de los consumos.',
      'Las cuotas indican la cuota facturada, no el total de cuotas futuras.',
      'Los consumos del PDF quedan fuera del flujo de gastos para evitar duplicaciones.',
      'El parser rechaza resúmenes de Banco Ciudad con compras USD sin un ejemplo validado.',
      'Revisá importes y categorías antes de guardar; no se almacena el PDF.',
    ],
  }
}


/**
 * This deterministic adapter deliberately supports the uploaded Visa layout.
 * Unknown/scanned layouts fail closed rather than hallucinating line items.
 * Individual purchase values always remain excluded from LTC cash-flow totals.
 */
export function parseVisaTextPages(pages: string[][], fileSha256: string): StatementExtraction {
  if (pages[0]?.some((line) => /\bVISA GOLD\b/i.test(line)) &&
      pages[0]?.some((line) => /CIERRE ACTUAL:/i.test(line))) {
    return parseBancoCiudadVisaTextPages(pages, fileSha256)
  }
  if (pages.length < 2 || !pages[0].some((line) => /Resumen Visa/i.test(line))) {
    throw new Error('UNSUPPORTED_PDF_LAYOUT')
  }
  const firstPage = pages[0].join(' ')
  const allDates = firstPage.match(/\b\d{2}\/\d{2}\/\d{2}\b/g) || []
  if (allDates.length < 6) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const close = iso(allDates[2]); const due = iso(allDates[3])
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
  const purchaseTotalMatch = /Subtotal de[^\n]*?Subtotal en pesos\D*([\d.]+,\d{2})\.?\s*Subtotal en d[oó]lares\D*([\d.]+,\d{2})/i.exec(pages.flat().find((line) => /Subtotal de/i.test(line)) || '')
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
