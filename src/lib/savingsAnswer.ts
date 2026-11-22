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


type Summary = {
  currency: Currency
  expense: number | null
  income: number | null
  verifiedSavings: number | null
  observedExpenseMonths: number
  observedIncomeMonths: number
  incomeRecordedTotal: number | null
}

const summaryFor = (raw: unknown, currency: Currency): Summary => {
  const entry: DataRecord = asRecord(raw) || {}
  const expenseData = asRecord(entry.expense)
  const incomeData = asRecord(entry?.income)
  const incomeObserved = asRecord(entry?.incomeObserved)
  const expense = finiteNonNegative(expenseData?.baseMonthly)
  const incomeMatched = finiteNonNegative(incomeData?.baseMonthly)
  const incomeStandalone = finiteNonNegative(incomeObserved?.baseMonthly)
  const reportedSavings = typeof entry?.possibleMonthlySavings === 'number' &&
    Number.isFinite(entry.possibleMonthlySavings) ? entry.possibleMonthlySavings : null

  // Same-three-month requirement for actual matched savings. Income from USD
  // salary months alone must not be treated as "100% USD saved".
  const months = Array.isArray(entry?.monthly)
    ? entry.monthly.map(asRecord).filter((row): row is DataRecord => Boolean(row))
      .filter((row) => validMonth(row.month) && row.hasExpenseData === true).slice(-3)
    : []
  const incomeMatchesExpenses = months.length === 3 &&
    months.every((row) => typeof row.incomeRecords === 'number' && row.incomeRecords > 0)
  const income = incomeStandalone ?? (incomeMatchesExpenses ? incomeMatched : null)
  const checkSavings = expense !== null && incomeMatched !== null
    ? Math.round((incomeMatched - expense) * 100) / 100 : null
  const verifiedSavings = incomeMatchesExpenses && reportedSavings !== null &&
    checkSavings !== null && Math.abs(reportedSavings - checkSavings) <= 0.02
      ? reportedSavings : null
  const observedExpenseMonths = integer(entry?.observedExpenseMonths) ?? 0
  const observedIncomeMonths = integer(incomeObserved?.observedIncomeMonths) ??
    integer(incomeData?.observedIncomeMonths) ?? 0

  return {
    currency,
    expense: observedExpenseMonths >= 3 ? expense : null,
    income,
    verifiedSavings,
    observedExpenseMonths,
    observedIncomeMonths,
    incomeRecordedTotal: finiteNonNegative(incomeObserved?.totalLastSixMonths),
  }
}

const summaryLine = (s: Summary): string => {
  const code = s.currency
  if (s.verifiedSavings !== null && s.expense !== null && s.income !== null) {
    const difference = s.verifiedSavings
    const label = difference < 0
      ? 'faltante de caja en ' + code + ' ' + localMoney(Math.abs(difference), code)
      : 'diferencia favorable en ' + code + ' ' + localMoney(difference, code)
    return '**' + code + ':** ingresan ' + localMoney(s.income, code) +
      '/mes; salen ' + localMoney(s.expense, code) + '/mes; **' + label + '**.'
  }

  const parts: string[] = []
  if (s.income !== null && s.observedIncomeMonths >= 3) {
    parts.push('ingresos registrados ≈ ' + localMoney(s.income, code) + '/mes')
  } else if (s.incomeRecordedTotal !== null && s.observedIncomeMonths > 0) {
    parts.push('ingresos registrados ' + localMoney(s.incomeRecordedTotal, code) +
      ' en ' + s.observedIncomeMonths + (s.observedIncomeMonths === 1 ? ' mes' : ' meses') +
      ' (sin promedio confiable)')
  } else {
    parts.push('sin tres meses de ingresos económicos clasificados en esta moneda')
  }

  if (s.expense !== null) {
    parts.push('gastos ≈ ' + localMoney(s.expense, code) + '/mes')
  } else {
    parts.push('sin tres meses con gastos registrados en ' + code)
  }
  parts.push('ahorro en ' + code + ' **no calculable**')
  return '**' + code + ':** ' + parts.join('; ') + '.'
}

const portfolioLine = (raw: unknown): string => {
  const record = asRecord(raw)
  if (!record) return 'No recibí datos del Portfolio desde LTC en esta consulta.'
  if (record.status !== 'ok') {
    if (record.status === 'empty') {
      return 'No hay posiciones cargadas en Portfolio; eso no demuestra que no existan ahorros fuera de LTC.'
    }
    return 'No pude consultar saldos completos del Portfolio; no voy a suponer que sean cero.'
  }

  const byCurrency = asRecord(record.byCurrency)
  if (!byCurrency) return 'El Portfolio no entregó saldos por moneda verificables.'
  const parts: string[] = []
  for (const currency of ['ARS', 'USD'] as const) {
    const balance = asRecord(byCurrency[currency])
    const amount = finiteNonNegative(balance?.balance)
    const count = typeof balance?.positionCount === 'number' ? balance.positionCount : 0
    if (amount !== null && Number.isInteger(count) && count > 0) {
      parts.push(currency + ' ' + localMoney(amount, currency) +
        ' (' + count + (count === 1 ? ' posición' : ' posiciones') + ')')
    }
  }
  if (!parts.length) return 'No pude verificar saldos de posiciones en ARS ni USD.'
  return '**' + parts.join(' · ') + '**. Saldos cargados por vos, no verificados en tiempo real; pueden incluir inversiones no líquidas.'
}

export function formatVerifiedSavingsAnswer(raw: unknown, horizon: number = 1): string {
  if (![1, 3, 6].includes(horizon)) horizon = 1
  const data = asRecord(raw)
  if (data?.scope !== 'spending-forecast') {
    return 'No puedo estimar tu ahorro bimonetario sin los agregados históricos de LTC. Abrí Lita desde **Transacciones** y volvé a consultar.'
  }
  const currencies = asRecord(data.currencies)
  if (!currencies) return 'No recibí los flujos históricos ARS/USD de LTC. No voy a inventar ingresos ni un saldo total.'

  const ars = summaryFor(currencies.ARS, 'ARS')
  const usd = summaryFor(currencies.USD, 'USD')
  const portfolio = portfolioLine(data.portfolioBalances)
  const usdEntry = asRecord(currencies.USD)
  const inflow = asRecord(usdEntry?.registeredCurrencyInflows)
  const currencyEntryCount = finiteNonNegative(inflow?.records)
  const currencyEntryMonths = integer(inflow?.observedMonths) ?? 0
  const currencyEntryTotal = finiteNonNegative(inflow?.totalLastSixMonths)
  const hasRecordedUsdInflows = inflow?.source === 'ingreso-divisas' &&
    currencyEntryCount !== null && currencyEntryCount > 0 &&
    currencyEntryTotal !== null && currencyEntryTotal > 0 && currencyEntryMonths > 0

  const lines = [
    '**Tu situación es bimonetaria.** Una brecha negativa en pesos **no implica por sí sola que estés perdiendo ahorros**, porque también puede haber ingresos o patrimonio en dólares.',
    '',
    '### Flujo mensual registrado (sin convertir monedas)',
    '- ' + summaryLine(ars),
    '- ' + summaryLine(usd),
    ...(hasRecordedUsdInflows ? [
      '- **Entradas de USD registradas en «Ingreso divisas»:** ' +
        localMoney(currencyEntryTotal as number, 'USD') + ' en ' +
        currencyEntryMonths + (currencyEntryMonths === 1 ? ' mes' : ' meses') +
        ' (' + currencyEntryCount + ' movimientos). ' +
        '**Estas entradas sí están registradas**; no puedo determinar sólo por la categoría ' +
        'si fueron sueldo, transferencias entre cuentas propias u otros fondos. ' +
        '**No las sumo al sueldo ni las considero ahorro automáticamente.**',
    ] : []),
    '',
    '### Ahorros y activos registrados en Portfolio',
    portfolio,
  ]

  const knownSavings = [ars, usd].filter((s) => s.verifiedSavings !== null)
  if (!knownSavings.length) {
    lines.push('', '**Ahorro mensual total: no calculable** con los ingresos y gastos comparables registrados. No considero los meses sin gastos como gasto cero.')
  } else if (knownSavings.length === 2) {
    lines.push('', '**Conclusión:** hay saldos mensuales calculables en ambas monedas, pero **no se suman ARS y USD** sin una cotización explícita.')
  } else {
    const remaining = knownSavings[0].currency === 'ARS' ? 'USD' : 'ARS'
    lines.push('', '**Conclusión:** el resultado de ' + knownSavings[0].currency +
      ' es solo el flujo de esa moneda. Falta historia comparable de ' +
      remaining + ' para estimar el ahorro global.')
  }

  const supportedIncome = [ars, usd].some((s) => s.income !== null)
  if (!supportedIncome) lines.push('Necesito ingresos registrados en LTC para calcular la capacidad de ahorro.')
  if (horizon > 1 && knownSavings.length) {
    const scenarios = knownSavings.map((s) => {
      const total = Math.round((s.verifiedSavings as number) * horizon * 100) / 100
      return s.currency + ' ' + localMoney(total, s.currency)
    })
    lines.push('**Escenario a ' + horizon + ' meses:** ' + scenarios.join(' · ') +
      ' si se mantiene el mismo ritmo; no es una predicción garantizada.')
  }

  lines.push('',
    '*No hay cotización ni conversión implícita: para calcular un equivalente global hace falta un tipo de cambio explícito. Vender USD para pagar ARS cambia la composición de los activos, no es un ingreso adicional.*',
    '*Los saldos de Portfolio son patrimonio registrado, NO ahorro generado en el mes, ni se deben sumar a los saldos de Bancos sin conciliar.*')
  const quality = asRecord(data.quality)
  if (typeof quality?.unclassifiedCount === 'number' && quality.unclassifiedCount > 0) {
    lines.push('*Hay ' + Math.floor(quality.unclassifiedCount) +
      ' movimientos sin clasificar excluidos; los flujos podrían estar incompletos.*')
  }
  const usdReview = asRecord(quality?.usdIncomeCurrencyReview)
  const reviewCount = typeof usdReview?.records === 'number' && Number.isFinite(usdReview.records)
    ? Math.floor(usdReview.records) : 0
  if (reviewCount > 0) {
    const categoryNames = Array.isArray(usdReview?.categories)
      ? usdReview.categories.filter((v): v is string => typeof v === 'string')
        .map((v) => v.replace(/[^\p{L}\p{N} .-]/gu, ' ').slice(0, 48).trim()).filter(Boolean).slice(0, 5)
      : []
    lines.push('*Revisá la moneda de ' + reviewCount +
      ' movimientos de ingreso asociados a categorías hoy configuradas en USD, ' +
      'pero guardados como ARS o sin USD explícito' +
      (categoryNames.length ? ' (' + categoryNames.join(', ') + ')' : '') +
      '. No los convertí automáticamente.*')
  }
  lines.push('*Cálculo: seis meses terminados, ponderando los últimos tres observados cuando hay datos suficientes. Los pagos de resúmenes registrados cuentan como egresos; no se duplican las compras del PDF.*')

  return lines.join('\n')
}
