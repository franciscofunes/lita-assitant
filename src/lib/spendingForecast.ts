/**
 * Forecast intents are a separate read-only workflow, not a date range query.
 * Avoid interpreting "próximos 3 meses" as historical months.
 * Scope screening runs before this parser in the chat composer and server.
 */
export const requestedSpendingForecast = (question: string): { months: number } | null => {
  const normalized = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const intent = /\b(?:proyecci(?:on|ones)|pronostic\w*|predic\w*|estimac\w*|futur\w*|proxim\w*|mes que viene|mes siguiente|voy a gastar|gastare|gastaria|podria ahorrar|podre ahorrar|si mantengo (?:este|el) ritmo|si reduzco (?:mis|los) gastos|probablemente gast\w*|tendencia de gastos|escenarios? de gastos)\b/
  if (!intent.test(normalized)) return null
  const explicit = normalized.match(/\b(?:proximos?\s+)?(\d{1,2})\s+mes(?:es)?\b/)
  if (explicit) {
    const months = Number(explicit[1])
    if (months < 1 || months > 6) return null
    return { months }
  }
  return { months: 1 }
}
