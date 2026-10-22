import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const chat = readFileSync(new URL('../src/components/Chat.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')

test('Lita follows LTC surface tokens with a responsive mobile header and actionable touch targets', () => {
  assert.match(chat, /flex flex-col gap-2 sm:flex-row sm:items-center/)
  assert.match(chat, /border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800/)
  assert.match(chat, /inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl/)
  assert.match(chat, /inline-flex min-h-\[44px\] flex-1 items-center justify-center/)
  assert.match(chat, /max-w-2xl/)
  assert.match(chat, /lita-chat-composer/)
  assert.match(chat, /visibleHeight/)
  assert.match(chat, /viewport\.addEventListener\('resize', update\)/)
})

test('Lita keeps historic conversation state until user confirmation and acknowledged deletion', () => {
  assert.match(chat, /role="alertdialog" aria-modal="true"/)
  assert.match(chat, /¿Eliminar esta conversación\?/)
  assert.match(chat, /setDeleteTarget\(thread\)/)
  assert.doesNotMatch(chat, /onClick=\{\(\) => deleteThread\(thread\.id\)\}/)
  assert.match(chat, /type: 'lita:history:delete'/)
  assert.match(chat, /type === 'lita:history:delete:result'/)
  assert.match(chat, /if \(response\.success === true\)/)
  assert.match(chat, /setHistoryThreads\(\(current\) => current\.filter/)
  assert.match(chat, /setDeleteError\('LTC no confirmó la eliminación/)
  assert.match(chat, /requestId !== pending\.requestId/)
})

test('untrusted embed parents cannot inject private messages or change visual theme', () => {
  assert.match(chat, /event\.source !== window\.parent/)
  assert.match(chat, /allowedParentOrigins\.has\(event\.origin\)/)
  assert.match(chat, /trustedLtcPreviewOrigin\.test\(event\.origin\)/)
  assert.match(chat, /document\.documentElement\.classList\.toggle\('dark'/)
  assert.match(chat, /window\.parent\.postMessage\(/)
})

test('financial messages preserve validated markdown, scoped ARS calculations, and safe provider handling', () => {
  assert.match(chat, /sanitizeAssistantOutput\(message\.content\)/)
  assert.match(chat, /verifiedSpending\.categories\.slice\(0, 3\)/)
  assert.match(chat, /requestedFinancialPeriod\(question\)/)
  assert.match(chat, /normalizeStoredMessages\(thread\.messages\)/)
  assert.match(chat, /saveStatus === 'error'/)
  assert.match(styles, /html\.dark \.lita-markdown \.lita-financial-th/)
  assert.match(styles, /html\.dark \.lita-markdown \.lita-financial-td/)
})
