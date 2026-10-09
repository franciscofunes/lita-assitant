export type HistoricalPeriod = { from: string; to: string; label: string }

const monthNames = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const isoDay = (year: number, month: number, day: number) =>
  [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')

/**
 * A deliberately bounded read-only period parser. Non-date requests keep the
 * dashboard current view. The authenticated LTC host validates all ranges again.
 * No Firebase credentials exist in the cross-origin LITA app.
 */
export const requestedFinancialPeriod = (
  question: string, today = new Date(),
): HistoricalPeriod | null => {
  const clean = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const yearMatch = clean.match(/\b(20\d{2})\b/)
  let year = yearMatch ? Number(yearMatch[1]) : today.getFullYear()
  const foundMonth = monthNames.findIndex((month) => new RegExp('\\b' + month + '\\b').test(clean))
  if (yearMatch && foundMonth >= 0) {
    const lastDay = new Date(year, foundMonth + 1, 0).getDate()
    return { from: isoDay(year, foundMonth + 1, 1), to: isoDay(year, foundMonth + 1, lastDay),
      label: monthNames[foundMonth] + ' ' + year }
  }
  if (foundMonth >= 0) {
    const lastDay = new Date(year, foundMonth + 1, 0).getDate()
    return { from: isoDay(year, foundMonth + 1, 1), to: isoDay(year, foundMonth + 1, lastDay),
      label: monthNames[foundMonth] + ' ' + year }
  }
  if (/\bmes pasado\b|\bultimo mes\b/.test(clean)) {
    const date = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    year = date.getFullYear()
    const month = date.getMonth()
    return { from: isoDay(year, month + 1, 1), to: isoDay(year, month + 1, new Date(year, month + 1, 0).getDate()),
      label: monthNames[month] + ' ' + year }
  }
  const last = clean.match(/\bultimos?\s+(\d{1,2})\s+meses\b/)
  if (last) {
    const months = Number(last[1])
    if (months < 1 || months > 12) return null
    const from = new Date(today.getFullYear(), today.getMonth() - months + 1, 1)
    return { from: isoDay(from.getFullYear(), from.getMonth() + 1, 1),
      to: isoDay(today.getFullYear(), today.getMonth() + 1, today.getDate()),
      label: 'Últimos ' + months + ' meses' }
  }
  if (/\b(?:ano pasado|ultimo ano)\b/.test(clean)) year = today.getFullYear() - 1
  else if (!yearMatch && !/\b(?:este ano|ano actual)\b/.test(clean)) return null
  if (year < 2000 || year > today.getFullYear() + 1) return null
  const lastDay = year === today.getFullYear()
    ? isoDay(today.getFullYear(), today.getMonth() + 1, today.getDate())
    : isoDay(year, 12, 31)
  return { from: isoDay(year, 1, 1), to: lastDay, label: String(year) }
}
