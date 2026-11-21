/**
 * Provider-independent answer for "how much could I save?".
 * Consumes only LTC's trusted, read-only, six-complete-month aggregate.
 * The current visible transaction filter is not an income or monthly-average source.
 */

type Currency = 'ARS' | 'USD'
type DataRecord = Record<string, unknown>

const asRecord = (value: unknown): DataRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as DataRecord
    : null

const finiteNonNegative = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e13
    ? value
    : null

const validMonth = (value: unknown): value is string =>
  typeof value === 'string' && /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(value)

const localMoney = (amount: number, currency: Currency): string =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round((amount + Number.EPSILON) * 100) / 100)

const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6
    ? value
    : null

/**
 * Savings is not the same as "reduce expenses by 15%" or a generic portfolio
 * follow-up; intercept only explicit savings/balance-rate questions.
 */
export function requestedSavingsEstimate(question: unknown): boolean {
  if (typeof question !== 'string' || question.length > 1500) return false
  const normalized = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const explicitlyChangedAssumptions = /\d+(?:[.,]\d+)?\s*%|\b(?:reduzco|reducir|reduccion|aumento|aumentar|subo|bajo)\b/.test(normalized)
  if (explicitlyChangedAssumptions) return false
  return /\b(?:cuanto\s+(?:podria|puedo|podre|voy\s+a|lograria|lograre|ahorraria)?\s*ahorr\w*|ahorro\s+(?:mensual|estimado|posible|potencial)|si\s+mantengo\s+(?:este|el|mi)\s+ritmo\s+de\s+ingresos\s+y\s+gastos|cuanto\s+me\s+(?:quedaria|queda)\s+(?:despues|luego)\s+de\s+(?:los\s+)?gastos)\b/.test(normalized)
}

type ExpenseMonth = {
  month: string
  incomeRecords: number
  hasExpenseData: boolean
}

export function formatVerifiedSavingsAnswer(raw: unknown, horizon: number = 1): string {
  if (![1, 3, 6].includes(horizon)) horizon = 1
  const data = asRecord(raw)
  if (data?.scope !== 'spending-forecast') {
    return 'No puedo estimar tu ahorro mensual sin los agregados históricos verificados de LTC. Abrí Lita desde **Transacciones** y volvé a consultar.'
  }

  const byCurrency = asRecord(data.currencies)
  if (!byCurrency) {
    return 'No recibí datos históricos suficientes de LTC para calcular tu ahorro. No voy a completar ingresos o importes que no conozco.'
  }

  const sections: string[] = []
  let validForecasts = 0
  let savingsAvailable = 0

  for (const currency of ['ARS', 'USD'] as const) {
    const values = asRecord(byCurrency[currency])
    if (!values) continue
    const expense = asRecord(values.expense)
    const monthlyExpense = finiteNonNegative(expense?.baseMonthly)
    const observed = integer(values?.observedExpenseMonths)

    if (monthlyExpense === null || observed === null || observed < 3) {
      continue
    }

    validForecasts++
    const income = asRecord(values?.income)
    const monthlyIncome = finiteNonNegative(income?.baseMonthly)
    const hostSavings = typeof values?.possibleMonthlySavings === 'number' && Number.isFinite(values.possibleMonthlySavings)
      ? values.possibleMonthlySavings : null
    const monthly = Array.isArray(values?.monthly) ? values.monthly
      .map((row: unknown) => asRecord(row))
      .filter((row): row is DataRecord => Boolean(row))
      .filter((row) => validMonth(row.month) && row.hasExpenseData === true)
      .slice(-3)
      .map((row): ExpenseMonth => ({
        month: row.month as string,
        incomeRecords: typeof row.incomeRecords === 'number' ? row.incomeRecords : 0,
        hasExpenseData: true,
      })) : []

    // The host creates savings only if income and expense refer to the same
    // three recent observed expense months; verify that invariant when months
    // are provided. Do not compute savings by subtracting visible-view totals.
    const incomeMonthsMatch = monthly.length === 3 && monthly.every((row) => row.incomeRecords > 0)
    const savingsCheck = monthlyIncome === null ? null
      : Math.round((monthlyIncome - monthlyExpense) * 100) / 100
    const verifiedSavings = hostSavings !== null && savingsCheck !== null &&
      incomeMonthsMatch && Math.abs(hostSavings - savingsCheck) <= 0.02
      ? hostSavings
      : null

    const lines: string[] = []

    if (verifiedSavings !== null) {
      savingsAvailable++
      if (verifiedSavings > 0) {
        lines.push(`**Podrías ahorrar aproximadamente ${localMoney(verifiedSavings, currency)} por mes en ${currency}**, si mantenés el mismo ritmo registrado de ingresos y gastos.`)
      } else if (verifiedSavings < 0) {
        lines.push(`**Con este ritmo no habría ahorro mensual en ${currency}: el déficit estimado sería de ${localMoney(Math.abs(verifiedSavings), currency)}.**`)
      } else {
        lines.push(`**Tus ingresos y gastos mensuales estimados en ${currency} estarían equilibrados: ahorro estimado ${localMoney(0, currency)}.**`)
      }
      lines.push('')
      lines.push('**Cómo se calculó (promedios mensuales):**')
      lines.push(`- Ingresos: **${localMoney(monthlyIncome as number, currency)}**`)
      lines.push(`- Gastos: **${localMoney(monthlyExpense, currency)}**`)
      lines.push(`- ${verifiedSavings >= 0 ? 'Ahorro' : 'Diferencia negativa'}: **${localMoney(verifiedSavings, currency)}**`)
      if (horizon > 1) {
        const multiplied = Math.round(verifiedSavings * horizon * 100) / 100
        lines.push(`- En **${horizon} meses** al mismo ritmo: **${localMoney(multiplied, currency)}** ${multiplied < 0 ? 'de déficit acumulado' : 'de diferencia acumulada'} (escenario, no garantía).`)
      }
    } else {
      lines.push(`**No puedo estimar cuánto podrías ahorrar por mes en ${currency}** porque faltan ingresos registrados en los mismos tres meses con gastos más recientes.`)
      lines.push(`- Gasto mensual de referencia: **${localMoney(monthlyExpense, currency)}**.`)
      const missingIncomeMonths = monthly.filter((row) => row.incomeRecords <= 0).map((row) => row.month)
      if (missingIncomeMonths.length) {
        lines.push(`- Faltan ingresos en: **${missingIncomeMonths.join(', ')}**.`)
      }
      lines.push('- Para estimar el ahorro necesito ingresos y gastos comparables, no solo totales del período visible.')
    }

    lines.push('')
    lines.push(`*Base: ${observed} de 6 meses completos con gastos registrados; se ponderaron los últimos tres meses observados.*`)

    const missingExpense = Array.isArray(values?.missingExpenseMonths)
      ? values.missingExpenseMonths.filter(validMonth)
      : []
    if (missingExpense.length) {
      lines.push(`*Meses sin gastos registrados: ${missingExpense.join(', ')}. No los traté como gasto cero.*`)
    }

    // These category projections are subsets of expenses, not additional
    // amounts to add to them. Never mix them with current visible-view totals.
    const categories = Array.isArray(values?.topCategories)
      ? values.topCategories.slice(0, 3).flatMap((entry: unknown) => {
        const category = asRecord(entry)
        const monthly = finiteNonNegative(category?.projectedMonthly)
        return typeof category?.category === 'string' && monthly !== null
          ? [`- ${category.category.replace(/[\r\n]/g, ' ').slice(0, 60)}: ${localMoney(monthly, currency)}`]
          : []
      }) : []
    if (categories.length) {
      lines.push('')
      lines.push('**Categorías con mayor gasto mensual proyectado (ya incluidas en el total):**')
      lines.push(...categories)
    }

    sections.push(lines.join('\n'))
  }

  if (!validForecasts) {
    return 'Todavía no hay al menos **tres meses completos con gastos registrados** en una misma moneda. No puedo calcular un ahorro mensual fiable. Revisá el historial de ingresos y gastos en Transacciones.'
  }

  const quality = asRecord(data.quality)
  const unclassifiedCount = typeof quality?.unclassifiedCount === 'number'
    ? Math.max(0, Math.floor(quality.unclassifiedCount)) : 0
  const caveats = [
    'Se usan **seis meses calendario completos**, no el filtro visible en Transacciones. Son escenarios nominales; no se incluyen inflación ni cambios futuros.',
    'Un **resumen de tarjeta** cuenta como pago registrado; no se suman nuevamente compras ni líneas de PDF.',
  ]
  if (unclassifiedCount > 0) {
    caveats.push(`Hay ${unclassifiedCount} movimiento(s) sin clasificar excluidos del cálculo; el resultado puede estar incompleto.`)
  }
  if (savingsAvailable === 0) {
    caveats.unshift('Para obtener un importe de ahorro, registrá los ingresos correspondientes a los meses comparados en LTC.')
  }

  return [...sections, '', caveats.map((note) => `*${note}*`).join('\n')].join('\n\n')
}
