import type { StatementExtraction, CardLine } from './visaStatementParser'

const decimalCents = (value: string): number => {
  if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(value)) throw new Error('UNSUPPORTED_PDF_LAYOUT')
  const normalized = value.replace(/\./g, '').replace(',', '.')
  return Math.round(Number(normalized) * 100)
}
const amount = (cents: number) => (cents / 100).toFixed(2)
const normalize = (raw: string) => raw.replace(/\s+/g, ' ').trim()
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
export function parseBancoCiudadVisaTextPages(pages: string[][], fileSha256: string): StatementExtraction {
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
    const merchant = normalize(
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
