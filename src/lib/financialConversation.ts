import { assessFinancialScope, MAX_LTC_FINANCIAL_PROMPT_CHARS } from './financialScope.ts'

export type ConversationMessage = { role: 'user' | 'assistant'; content: string }

const followUpAcknowledgement =
  /^(?:(?:ok(?:ay)?|s[ií]|yes|dale|perfecto|de acuerdo|aprobado|apruebo|lo apruebo|confirmado|confirmo|continu[aá]|contin[uú]a|segu[ií]|adelante|hazlo|hacelo|proceed|go ahead|let['’]?s go|i approve|do it|vamos|listo)[\s,!.'’:-]*)+$/i
const contextualFollowUp =
  /^(?:¿?y (?:eso|cu[aá]nto|cu[aá]l|qu[eé]|con (?:el|la|los|las)|si |en (?:el|la)|despu[eé]s)|(?:mostr[aá]|mostr[aá]me|dame|gener[aá]|gener[aá]me|compar[aá]|compar[aá]me|correg[ií]|agreg[aá]|inclu[ií]|explic[aá]|resum[ií]) (?:eso|el (?:resultado|an[aá]lisis|detalle|bloque|plan)|la (?:comparaci[oó]n|tabla)|los (?:bloques|datos)|las (?:diferencias|posiciones)))(?:[\s\S]{0,120})$/i
const outOfScopeFollowUp = /\b(?:javascript|typescript|python|react|github|programaci[oó]n|c[oó]digo|receta|cocina|chiste|poema|f[uú]tbol|pel[ií]cula|pol[ií]tica|ignore|ignora|olvida|jailbreak|system prompt|developer message|act[uú]a como)\b/i

export const assessConversationScope = (messages: ConversationMessage[]): 'allowed' | 'greeting' | 'denied' => {
  const latestIndex = messages.map((m) => m.role).lastIndexOf('user')
  if (latestIndex < 0) return 'denied'
  const latest = messages[latestIndex].content
  const standalone = assessFinancialScope(latest)
  if (standalone !== 'denied') return standalone

  const question = latest.trim()
  if (!question || question.length > 300 || outOfScopeFollowUp.test(question)) return 'denied'
  if (!followUpAcknowledgement.test(question) && !contextualFollowUp.test(question)) return 'denied'

  // A short acknowledgement is only meaningful after an explicit, valid
  // financial request in the same conversation. The host context alone never
  // grants permission to treat unrelated questions as financial.
  return messages.slice(Math.max(0, latestIndex - 18), latestIndex)
    .some((message) => message.role === 'user' && assessFinancialScope(message.content) === 'allowed')
    ? 'allowed'
    : 'denied'
}

const privateThoughtMarkers = [
  /(?:^|\n)\s*\d+\.\s*Plan the Response Structure\s*:/i,
  /\bI need to extract per-asset data\b/i,
  /\bthe core data is the JSON\b/i,
  /(?:^|\n)\s*(?:analysis|internal reasoning|chain of thought)\s*:/i,
]

// Some providers send apparently final text in English despite Spanish-only
// instructions. Reject predominantly English prose rather than showing the
// user an untranslated answer; allow financial acronyms, English account
// names, field identifiers and occasional quoted English terms.
const englishWords = /\b(?:the|this|that|these|those|and|but|because|which|from|with|for|are|was|will|should|would|need|have|there|about|your|you|please|based|provided|following|first|next|also|some|only|however|although|then|before|after|each|must|them|their|here|can|into|does|cannot)\b/gi
const spanishWords = /\b(?:el|la|los|las|de|del|en|y|que|con|para|por|una|un|est[aá]|est[aá]n|son|seg[uú]n|datos|saldo|tasa|ganancia|cuenta|inversi[oó]n|moneda|registrad[ao]|vigente|aportes|retiros|rendimiento|resumen|cada|sin|hay|tiene|verificar|debe|no|se|pero|como|m[aá]s|porque|si|fuente|disponible)\b/gi
const englishPhrases = /\b(?:there (?:is|are)|i (?:need|will|should|would|have|can)|we (?:need|will|should|have)|the (?:portfolio|analysis|data|result|user|answer|following|report|response)|let['’]s|in order to|based on the)\b/i

export const isEnglishDominantAnswer = (text: string): boolean => {
  const prose = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(?:annualRate|sourceCheckedAt|rateVerifiedAt|LTC Asset Update)/g, ' ')
  const english = (prose.match(englishWords) || []).length
  const spanish = (prose.match(spanishWords) || []).length
  return english >= 4 && (
    (englishPhrases.test(prose) && english > spanish) ||
    (english >= 7 && english >= spanish * 2 + 3)
  )
}

export const sanitizeAssistantOutput = (raw: string): string | null => {
  // Buffer until the provider completes so internal reasoning cannot leak in
  // the first streamed token. Some OpenAI-compatible providers put <think>
  // content directly into delta.content rather than a reasoning field.
  let answer = raw
    .replace(/<\s*(?:think|analysis|reasoning)\b[^>]*>[\s\S]*?<\s*\/\s*(?:think|analysis|reasoning)\s*>/gi, '')
    .trim()
  if (/<\s*(?:think|analysis|reasoning)\b/i.test(answer)) return null
  answer = answer.replace(/^(?:#{1,3}\s*)?(?:final answer|respuesta final)\s*:?\s*/i, '').trim()
  if (!answer || privateThoughtMarkers.some((pattern) => pattern.test(answer)) || isEnglishDominantAnswer(answer)) return null
  return answer
}

export const buildConversationForProvider = (messages: ConversationMessage[]): ConversationMessage[] => {
  const lastIndex = messages.map((m) => m.role).lastIndexOf('user')
  if (lastIndex < 0) return []
  const start = Math.max(0, lastIndex - 18)
  let anchor = lastIndex
  for (let index = lastIndex; index >= start; index--) {
    if (messages[index].role === 'user' && assessFinancialScope(messages[index].content) === 'allowed') {
      anchor = index
      break
    }
  }

  const selected: ConversationMessage[] = []
  for (let i = anchor; i <= lastIndex; i++) {
    const item = messages[i]
    if (item.role === 'assistant') {
      const content = sanitizeAssistantOutput(item.content)
      if (content) selected.push({ role: 'assistant', content: content.slice(0, 3500) })
    } else if (i === lastIndex || assessFinancialScope(item.content) === 'allowed' ||
      (item.content.length <= 300 && !outOfScopeFollowUp.test(item.content) &&
        (followUpAcknowledgement.test(item.content.trim()) || contextualFollowUp.test(item.content.trim())))) {
      selected.push(item)
    }
  }

  // Preserve the original complete LTC report for follow-up actions, and keep
  // the last few replies inside a strict cost/context budget.
  const maxChars = MAX_LTC_FINANCIAL_PROMPT_CHARS + 7500
  while (selected.length > 2 && selected.reduce((sum, m) => sum + m.content.length, 0) > maxChars) {
    selected.splice(1, 1)
  }
  return selected
}
