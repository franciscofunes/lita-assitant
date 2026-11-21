export type ReportCurrency = 'ARS' | 'USD'

export type CurrencyReport = {
  currency: ReportCurrency
  observedMonths: number
  missingMonths: string[]
  lowMonthly: number
  baseMonthly: number
  highMonthly: number
  monthlySavings: number | null
  categories: Array<{ name: string; amount: number }>
  history: Array<{ month: string; amount: number }>
}

export type VisualReport = {
  kind: 'spending' | 'cards'
  through: string
  quality: string[]
  currencies: CurrencyReport[]
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null

const amount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e12
    ? value : null

const signedAmount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e12
    ? value : null

const monthString = (value: unknown) =>
  typeof value === 'string' && /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(value) ? value : null

/** Only aggregates from the authenticated LTC host; no individual transactions. */
export function parseSpendingVisualReport(raw: unknown): VisualReport | null {
  const input = record(raw)
  if (input?.scope !== 'spending-forecast') return null
  const currenciesInput = record(input.currencies)
  if (!currenciesInput) return null
  const currencies: CurrencyReport[] = []
  for (const currency of ['ARS', 'USD'] as const) {
    const details = record(currenciesInput[currency])
    if (!details) continue
    const expense = record(details.expense)
    const base = amount(expense?.baseMonthly)
    const low = amount(expense?.lowMonthly)
    const high = amount(expense?.highMonthly)
    if (base === null || low === null || high === null || low > base || base > high) continue
    const categories = Array.isArray(details?.topCategories) ? details.topCategories : []
    const monthly = Array.isArray(details?.monthly) ? details.monthly : []
    currencies.push({
      currency,
      observedMonths: Math.min(6, Math.max(0, Number(details?.observedExpenseMonths) || 0)),
      missingMonths: Array.isArray(details?.missingExpenseMonths)
        ? details.missingExpenseMonths.filter((v: unknown): v is string => Boolean(monthString(v))).slice(0, 6) : [],
      lowMonthly: low, baseMonthly: base, highMonthly: high,
      monthlySavings: signedAmount(details?.possibleMonthlySavings),
      categories: categories.flatMap((row: unknown) => {
        const value = record(row)
        const money = amount(value?.projectedMonthly)
        return value && money !== null && typeof value.category === 'string'
          ? [{ name: value.category.slice(0, 45), amount: money }] : []
      }).slice(0, 4),
      history: monthly.flatMap((row: unknown) => {
        const value = record(row)
        const month = monthString(value?.month)
        return month && value && value.hasExpenseData === true && amount(value.expense) !== null
          ? [{ month, amount: amount(value.expense) as number }] : []
      }).slice(-6),
    })
  }
  if (!currencies.length) return null
  const quality = record(input.quality)
  const unclassified = Number(quality?.unclassifiedCount) || 0
  return {
    kind: 'spending',
    through: typeof input.historyThrough === 'string' && /^20\d{2}-\d\d-\d\d$/.test(input.historyThrough)
      ? input.historyThrough : 'últimos seis meses completos',
    quality: [
      'Escenarios nominales, no predicciones garantizadas. Sin inflación ni tipo de cambio.',
      ...(unclassified > 0 ? [`${unclassified} movimiento(s) sin categoría quedaron excluidos.`] : []),
    ],
    currencies,
  }
}

/** Cards use only recorded statement-expense months, not open-cycle charges or PDF lines. */
export function parseCardsVisualReport(raw: unknown): VisualReport | null {
  const input = record(raw)
  if (input?.section !== 'banks' || input.privacyHidden === true) return null
  const spending = record(input.monthlyCardSpending)
  if (spending?.scope !== 'historical-card-statement-expenses-by-transaction-date' ||
    !Array.isArray(spending.byCurrency)) return null
  const currencies: CurrencyReport[] = []
  for (const currency of ['ARS', 'USD'] as const) {
    const item = spending.byCurrency.map(record).find((v) => v?.currency === currency)
    const months = (item && Array.isArray(item.months) ? item.months : [])
      .flatMap((row: unknown) => {
        const value = record(row)
        const month = monthString(value?.month)
        const total = amount(value?.amount)
        return month && total !== null && Number(value?.statementCount) > 0
          ? [{ month, amount: total }] : []
      }).sort((a, b) => a.month.localeCompare(b.month)).slice(-6)
    if (months.length < 3) continue
    const values = months.map((m) => m.amount)
    const base = Math.round(values.reduce((acc, v) => acc + v, 0) * 100 / values.length) / 100
    currencies.push({
      currency, observedMonths: months.length, missingMonths: [],
      lowMonthly: Math.min(...values), baseMonthly: base, highMonthly: Math.max(...values),
      monthlySavings: null, categories: [], history: months,
    })
  }
  if (!currencies.length) return null
  return {
    kind: 'cards',
    through: 'Últimos seis meses registrados (como máximo)',
    quality: [
      'Comparación histórica de resúmenes pagados; NO anticipa un cierre real.',
      'No incluye cuotas futuras, compras del ciclo abierto ni cargos no registrados.',
      'No se duplican PDF, consumos manuales ni registros de Transacciones.',
    ],
    currencies,
  }
}

export const reportHorizons = [1, 3, 6] as const
export type ReportHorizon = typeof reportHorizons[number]

export function amountsForHorizon(currency: CurrencyReport, months: ReportHorizon) {
  return {
    low: Math.round(currency.lowMonthly * months * 100) / 100,
    base: Math.round(currency.baseMonthly * months * 100) / 100,
    high: Math.round(currency.highMonthly * months * 100) / 100,
  }
}

const money = (v: number, currency: ReportCurrency) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v)

const roundBox = (
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const text = (ctx: CanvasRenderingContext2D, label: string, x: number, y: number,
  size = 24, color = '#1e293b', weight = 500, maxWidth?: number) => {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`
  ctx.fillStyle = color
  ctx.fillText(label, x, y, maxWidth)
}

const illustrationImage = async (blob: Blob): Promise<HTMLImageElement> => {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    // Decode resolves before the URL is revoked; the bitmap stays resident.
    URL.revokeObjectURL(url)
  }
}

/** Local Canvas rendering: no network, no LLM-rendered numbers, no new dependencies. */
export async function renderVisualReport(
  report: VisualReport, horizon: ReportHorizon, illustration?: Blob | null,
): Promise<Blob> {
  if (!reportHorizonValid(horizon)) throw new Error('Horizonte de reporte inválido.')
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1490
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no permite crear el reporte PNG.')
  ctx.fillStyle = '#f3f5fa'
  ctx.fillRect(0, 0, 1080, 1490)

  const head = ctx.createLinearGradient(0, 0, 1080, 280)
  head.addColorStop(0, '#121a37')
  head.addColorStop(1, '#36256b')
  ctx.fillStyle = head
  roundBox(ctx, 34, 34, 1012, 235, 36)
  ctx.fill()
  text(ctx, 'LTC / LITA', 77, 95, 25, '#c4b5fd', 800)
  text(ctx, report.kind === 'cards' ? 'Reporte de tarjetas' : 'Proyección de gastos',
    77, 157, 52, '#ffffff', 800, 650)
  text(ctx, report.kind === 'cards'
    ? 'Referencia histórica, sin anticipar el próximo cierre'
    : `Escenarios acumulados a ${horizon} ${horizon === 1 ? 'mes' : 'meses'}`,
  77, 202, 24, '#ddd6fe', 500, 700)

  if (illustration?.type.startsWith('image/') && illustration.size < 8_000_000) {
    try {
      const image = await illustrationImage(illustration)
      ctx.save()
      roundBox(ctx, 803, 62, 203, 172, 26)
      ctx.clip()
      ctx.globalAlpha = 0.84
      ctx.drawImage(image, 803, 62, 203, 172)
      ctx.restore()
    } catch { /* Decoration is never required for a valid report. */ }
  } else {
    ctx.fillStyle = 'rgba(167,139,250,0.15)'
    roundBox(ctx, 827, 72, 170, 155, 32)
    ctx.fill()
    text(ctx, '◈', 876, 178, 84, '#a78bfa', 600)
  }

  for (const [index, currency] of (['ARS', 'USD'] as const).entries()) {
    const blockY = 289 + index * 453
    ctx.fillStyle = '#ffffff'
    roundBox(ctx, 34, blockY, 1012, 431, 28)
    ctx.fill()
    const details = report.currencies.find((r) => r.currency === currency)
    ctx.fillStyle = currency === 'ARS' ? '#dbeafe' : '#dcfce7'
    roundBox(ctx, 67, blockY + 27, 90, 46, 16)
    ctx.fill()
    text(ctx, currency, 85, blockY + 59, 25, currency === 'ARS' ? '#1d4ed8' : '#166534', 800)
    text(ctx, details
      ? `${details.observedMonths} meses con registros`
      : 'Menos de tres meses con registros',
    177, blockY + 59, 23, '#64748b', 500, 790)
    if (!details) {
      text(ctx, 'Sin datos suficientes para calcular escenarios.', 80, blockY + 163, 29, '#64748b')
      text(ctx, 'No se interpreta la falta de movimientos como gasto cero.', 80, blockY + 209, 22, '#64748b')
      continue
    }
    const scenarios = amountsForHorizon(details, report.kind === 'cards' ? 1 : horizon)
    const values = [
      { title: 'MÍNIMO HISTÓRICO', amount: scenarios.low, color: '#475569' },
      { title: report.kind === 'cards' ? 'PROMEDIO MENSUAL' : 'ESCENARIO BASE', amount: scenarios.base, color: '#6d28d9' },
      { title: 'MÁXIMO HISTÓRICO', amount: scenarios.high, color: '#b45309' },
    ]
    values.forEach((v, i) => {
      const x = 68 + i * 337
      ctx.fillStyle = i === 1 ? '#f5f3ff' : '#f8fafc'
      roundBox(ctx, x, blockY + 103, 316, 110, 16)
      ctx.fill()
      text(ctx, v.title, x + 17, blockY + 135, 17, '#64748b', 700, 284)
      text(ctx, money(v.amount, currency), x + 17, blockY + 179, 29, v.color, 800, 283)
    })
    if (report.kind === 'cards') {
      text(ctx, 'Resúmenes mensuales registrados', 70, blockY + 256, 22, '#334155', 700)
      const high = Math.max(...details.history.map((h) => h.amount), 1)
      details.history.slice(-6).forEach((entry, idx, history) => {
        const colWidth = Math.min(144, 895 / Math.max(history.length, 1))
        const x = 89 + idx * colWidth
        const h = Math.round(93 * entry.amount / high)
        ctx.fillStyle = '#a78bfa'
        roundBox(ctx, x, blockY + 376 - Math.max(4, h), Math.min(75, colWidth - 12), Math.max(4, h), 5)
        ctx.fill()
        text(ctx, entry.month.slice(5) + '/' + entry.month.slice(2, 4),
          x, blockY + 399, 19, '#64748b', 500)
      })
    } else {
      text(ctx, 'Categorías con mayor proyección mensual', 70, blockY + 256, 22, '#334155', 700)
      const max = Math.max(...details.categories.map((c) => c.amount), 1)
      details.categories.slice(0, 3).forEach((category, i) => {
        const y = blockY + 297 + i * 39
        const bar = 288 * category.amount / max
        text(ctx, category.name, 70, y + 17, 20, '#475569', 500, 280)
        ctx.fillStyle = '#ede9fe'
        roundBox(ctx, 391, y + 1, 290, 20, 8)
        ctx.fill()
        if (bar > 0) {
          ctx.fillStyle = '#8b5cf6'
          roundBox(ctx, 391, y + 1, Math.max(3, bar), 20, 8)
          ctx.fill()
        }
        text(ctx, money(category.amount, currency), 705, y + 19, 21, '#1e293b', 700, 280)
      })
      if (details.monthlySavings !== null) {
        text(ctx, `Saldo hipotético mensual ingresos − gastos: ${money(details.monthlySavings, currency)}`,
          70, blockY + 409, 19, details.monthlySavings >= 0 ? '#15803d' : '#b91c1c', 700, 920)
      }
    }
  }

  ctx.fillStyle = '#e9edf6'
  roundBox(ctx, 35, 1202, 1010, 240, 26)
  ctx.fill()
  text(ctx, 'CÓMO LEER ESTE REPORTE', 70, 1251, 23, '#334155', 800)
  text(ctx, report.kind === 'cards'
    ? 'Mínimo / promedio / máximo por mes de resumen registrado; no deuda futura.'
    : 'Escenario base: media ponderada de hasta tres meses observados; no pronóstico estadístico.',
    70, 1295, 21, '#475569', 500, 930)
  text(ctx, report.kind === 'cards'
    ? 'Los meses sin resúmenes no se cuentan como gasto cero.'
    : 'Bajo / alto: mínimos y máximos mensuales observados, escalados al horizonte.',
    70, 1330, 20, '#475569', 500, 930)
  text(ctx, report.quality[0] || '', 70, 1364, 18, '#64748b', 500, 930)
  text(ctx, report.quality[1] || `Fuente: LTC · hasta ${report.through}`,
    70, 1397, 18, '#64748b', 500, 930)
  text(ctx, 'Reporte informativo · cifras en ARS y USD sin conversión · generado localmente',
    70, 1465, 18, '#64748b', 500, 950)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo exportar el PNG.')), 'image/png')
  })
}

export const reportHorizonValid = (value: number): value is ReportHorizon =>
  value === 1 || value === 3 || value === 6
