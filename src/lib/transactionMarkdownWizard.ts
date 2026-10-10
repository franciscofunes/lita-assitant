export type TransactionCategory = { name: string; isExpense?: boolean }
export type WizardField =
  | 'category' | 'name' | 'institution' | 'currencyQuantity'
  | 'currencyExchangeRate' | 'amount' | 'date' | 'selectedCloseDate' | 'comment'
export type WizardAnswers = Partial<Record<WizardField, string>>

export const kindForCategory = (category: string) => {
  if (/Venta divisas/i.test(category)) return 'sale'
  if (/Compra divisas/i.test(category)) return 'purchase'
  if (/Ingreso divisas/i.test(category)) return 'currency-income'
  if (/Resumen tarjeta/i.test(category)) return 'statement'
  return 'standard'
}

export const normalizeAmount = (raw: string): number | null => {
  const cleaned = raw.trim().replace(/\s/g, '')
  // Allow e.g. 1579.50, 1.579,50, 1,579.50 and 1579,50.
  if (!/^[0-9]+(?:[.,][0-9]+)*$/.test(cleaned)) return null
  const comma = cleaned.lastIndexOf(',')
  const dot = cleaned.lastIndexOf('.')
  const decimalSeparator = comma > dot ? ',' : '.'
  const other = decimalSeparator === ',' ? '.' : ','
  const normalized = cleaned.split(other).join('').replace(decimalSeparator, '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export const questionsForCategory = (category: string): WizardField[] => {
  const kind = kindForCategory(category)
  if (kind === 'statement') return ['category', 'name', 'amount', 'date', 'selectedCloseDate', 'comment']
  if (kind === 'sale' || kind === 'purchase')
    return ['category', 'name', 'institution', 'currencyQuantity', 'currencyExchangeRate', 'amount', 'date', 'comment']
  if (kind === 'currency-income')
    return ['category', 'name', 'institution', 'currencyQuantity', 'date', 'comment']
  return ['category', 'name', 'amount', 'date', 'comment']
}

export const questionLabel = (field: WizardField, category = ''): string => {
  if (field === 'category') return '¿Qué categoría querés cargar?'
  if (field === 'name') return '¿Cómo querés llamar a la transacción?'
  if (field === 'institution') return '¿En qué banco o plataforma fue?'
  if (field === 'currencyQuantity') return '¿Cuántos dólares fueron?'
  if (field === 'currencyExchangeRate') return '¿Qué cotización ARS por USD usaste?'
  if (field === 'amount') {
    if (['sale', 'purchase'].includes(kindForCategory(category)))
      return '¿Cuántos pesos recibiste o pagaste? (Opcional: Enter para calcularlos)'
    return '¿Cuál fue el importe en pesos (ARS)?'
  }
  if (field === 'date') return kindForCategory(category) === 'statement'
    ? '¿En qué fecha vence el resumen?'
    : '¿En qué fecha fue la operación?'
  if (field === 'selectedCloseDate') return '¿Cuál fue la fecha de cierre de la tarjeta?'
  return '¿Querés agregar un comentario? (Opcional)'
}

export const isValidDate = (date: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const value = new Date(date + 'T12:00:00Z')
  return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === date
}

export const validateWizardAnswer = (field: WizardField, input: string, category = ''): string | null => {
  const value = input.trim()
  if (field === 'comment') return null
  if (field === 'amount' && ['sale', 'purchase'].includes(kindForCategory(category)) && !value) return null
  if (!value) return 'Completá este dato para continuar.'
  if (field === 'category' || field === 'name' || field === 'institution') {
    return value.length <= 120 ? null : 'Usá un texto de hasta 120 caracteres.'
  }
  if (field === 'date' || field === 'selectedCloseDate')
    return isValidDate(value) ? null : 'Ingresá una fecha válida.'
  if (field === 'amount' || field === 'currencyQuantity' || field === 'currencyExchangeRate')
    return normalizeAmount(value) !== null ? null : 'Ingresá un número mayor que cero.'
  return null
}

const lineValue = (value: string): string =>
  value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)

export const buildTransactionMarkdown = (answers: WizardAnswers): string => {
  const kind = kindForCategory(answers.category || '')
  for (const field of questionsForCategory(answers.category || '')) {
    const error = validateWizardAnswer(field, answers[field] || '', answers.category || '')
    if (error) throw new Error(`${questionLabel(field, answers.category)}: ${error}`)
  }
  const entries: Array<[string, string]> = [
    ['name', lineValue(answers.name || '')],
    ['category', lineValue(answers.category || '')],
    ['date', answers.date || ''],
  ]
  const amount = (field: WizardField) => {
    const parsed = normalizeAmount(answers[field] || '')
    if (parsed === null) throw new Error('Importe inválido')
    return String(parsed)
  }

  if (kind === 'currency-income' || kind === 'sale' || kind === 'purchase') {
    entries.push(['currencyQuantity', amount('currencyQuantity')])
    if (answers.institution?.trim()) entries.push(['institution', lineValue(answers.institution)])
    if (kind === 'sale' || kind === 'purchase') {
      const rate = normalizeAmount(answers.currencyExchangeRate || '')
      const quantity = normalizeAmount(answers.currencyQuantity || '')
      if (rate === null || quantity === null) throw new Error('Faltan cantidad y cotización')
      entries.push(['currencyExchangeRate', String(rate)])
      const actual = normalizeAmount(answers.amount || '')
      entries.push(['amount', (actual ?? Math.round(quantity * rate * 100) / 100).toFixed(2)])
    }
  } else {
    entries.push(['amount', amount('amount')])
  }
  if (kind === 'statement') {
    entries.push(['selectedExpirationDate', answers.date || ''])
    entries.push(['selectedCloseDate', answers.selectedCloseDate || ''])
  }
  if (answers.comment?.trim()) entries.push(['comment', lineValue(answers.comment)])
  entries.push(['source', 'lita-guided'])
  return '### LTC Transactions Import\n\n- ' + entries.map(([k, v]) => `${k}: ${v}`).join('\n  ')
}
