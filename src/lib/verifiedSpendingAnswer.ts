/**
 * Exact, provider-independent forecast answers from the authenticated LTC
 * aggregate. Never ask a text model to transcribe financial values.
 */
import { requestedSpendingForecast } from './spendingForecast'

type Currency = 'ARS' | 'USD'
type Data = Record<string, unknown>
const asObject = (v: unknown): Data | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Data : null
const number = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e13
    ? Math.round((v + Number.EPSILON) * 100) / 100 : null
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6 ? v : 0
const money = (n: number, currency: Currency): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const validMonth = (v: unknown): v is string =>
  typeof v === 'string' && /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(v)

const expenseScenario = (expense: Data, months: number) => {
  const scenarios = Array.isArray(expense.scenarios) ? expense.scenarios : []
  const selected = scenarios.map(asObject).find((v) => v?.months === months)
  const b = number(selected?.base) ??
    (number(expense.baseMonthly) === null ? null : number((expense.baseMonthly as number) * months))
  const l = number(selected?.low) ??
    (number(expense.lowMonthly) === null ? null : number((expense.lowMonthly as number) * months))
  const h = number(selected?.high) ??
    (number(expense.highMonthly) === null ? null : number((expense.highMonthly as number) * months))
  return b !== null && l !== null && h !== null && l <= b && b <= h
    ? { base: b, low: l, high: h } : null
}

const spendingReduction = (question: unknown): number | null => {
  if (typeof question !== 'string') return null
  const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const found = q.match(/(?:reduzco|reducir|redujera|bajara)\s+(?:mis\s+|los\s+)?gastos\s+(?:en\s+|un\s+)?(\d+(?:[,.]\d+)?)\s*%/)
  if (!found) return null
  const percent = Number(found[1].replace(',', '.'))
  return Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : null
}

export function formatVerifiedSpendingForecast(raw: unknown, question: unknown, requestedMonths?: number): string {
  const data = asObject(raw)
  const currencies = asObject(data?.currencies)
  if (data?.scope !== 'spending-forecast' || !currencies) {
    return 'No recibí un historial verificable de LTC para esta proyección. Abrí Lita desde Transacciones y reintentá.'
  }
  const parsed = typeof question === 'string' ? requestedSpendingForecast(question) : null
  const months = requestedMonths && Number.isInteger(requestedMonths) &&
    requestedMonths >= 1 && requestedMonths <= 6 ? requestedMonths : parsed?.months ?? 1
  const reduction = spendingReduction(question)
  const factor = reduction === null ? 1 : 1 - reduction / 100
  const lines: string[] = []
  let valid = 0
  for (const currency of ['ARS', 'USD'] as const) {
    const entry = asObject(currencies[currency])
    const expense = asObject(entry?.expense)
    const observed = count(entry?.observedExpenseMonths)
    const projection = expense && observed >= 3 ? expenseScenario(expense, months) : null
    if (!projection) {
      lines.push('**' + currency + ': sin estimación disponible.** ' +
        (observed === 1 ? 'Hay 1 mes con gastos registrados.' :
          'Hay ' + observed + ' meses con gastos registrados.') +
        ' Se necesitan al menos tres meses; no se supone gasto cero en períodos sin movimientos.')
      continue
    }
    valid++
    const adjusted = (v: number) => money(round(v * factor), currency)
    lines.push('**' + currency + ': ' + adjusted(projection.base) + '**' +
      (months === 1 ? ' de gasto estimado para el próximo mes.' :
        ' de gasto acumulado estimado en ' + months + ' meses.') +
      '\n- Escenario bajo: ' + adjusted(projection.low) +
      '\n- Escenario alto: ' + adjusted(projection.high) +
      '\n- Basado en ' + observed + ' de seis meses completos con gastos registrados.')
    const categories = Array.isArray(entry?.topCategories) ? entry.topCategories.slice(0, 3) : []
    const breakdown = categories.flatMap((item: unknown) => {
      const c = asObject(item)
      const monthly = number(c?.projectedMonthly)
      if (monthly === null || typeof c?.category !== 'string') return []
      const safe = c.category.replace(/[\r\n*_\[\]<>]/g, ' ').slice(0, 55).trim()
      return safe ? ['- ' + safe + ': ' + adjusted(round(monthly * months))] : []
    })
    if (breakdown.length) {
      lines.push('**Categorías principales de ' + currency + '** (incluidas en ese total):\n' +
        breakdown.join('\n'))
    }
    const missing = Array.isArray(entry?.missingExpenseMonths) ?
      entry.missingExpenseMonths.filter(validMonth).slice(0, 6) : []
    if (missing.length) lines.push('_Meses sin gastos registrados en ' + currency +
      ': ' + missing.join(', ') + '. No se cuentan como cero._')
  }
  if (!valid) return '**Todavía no puedo proyectar un importe confiable.**\n\n' + lines.join('\n\n')
  const heading = months === 1 ? '**Gastos estimados para el próximo mes**' :
    '**Gastos estimados acumulados para los próximos ' + months + ' meses**'
  const result = [heading]
  if (reduction !== null) result.push('_Supuesto: los gastos bajan un ' + reduction + ' % respecto de la referencia histórica._')
  result.push(...lines)
  const quality = asObject(data.quality)
  if (typeof quality?.unclassifiedCount === 'number' && quality.unclassifiedCount > 0) {
    result.push('_Hay ' + Math.floor(quality.unclassifiedCount) + ' movimientos sin clasificar excluidos del cálculo._')
  }
  result.push('_Escenarios nominales basados en los últimos tres meses observados: no representan gastos futuros confirmados. No incluyen inflación, cuotas futuras ni conversión entre ARS y USD._')
  return result.join('\n\n')
}
