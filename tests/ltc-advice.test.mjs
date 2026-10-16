import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedLtcAdviceOrigin, parseLtcAdvicePrompt, buildLtcAdviceChatPayload } from '../src/lib/ltcAdvice.ts'

test('allows the LTC production hosts and explicitly configured origins only', () => {
  for (const origin of [
    'https://lleva-tus-cuentas.netlify.app', 'https://llevatuscuentas.vercel.app',
    'http://localhost:3000', 'https://deploy-preview-78--lleva-tus-cuentas.netlify.app',
  ]) assert.equal(isAllowedLtcAdviceOrigin(origin), true)
  for (const origin of [
    '', 'https://evil.example.com', 'https://llevatuscuentas.vercel.app.attacker.test',
    'https://fake-deploy-preview-1--lleva-tus-cuentas.netlify.app',
    'http://localhost:9999',
  ]) assert.equal(isAllowedLtcAdviceOrigin(origin), false)
  assert.equal(isAllowedLtcAdviceOrigin('https://custom.example', 'https://another.example, https://custom.example'), true)
})

test('rejects oversized, missing and non-string requests before spending AI credits', () => {
  assert.equal(parseLtcAdvicePrompt('  Consejos de ahorro  '), 'Consejos de ahorro')
  for (const value of [null, undefined, [], {}, '', '   ', 'x'.repeat(1501)]) {
    assert.throws(() => parseLtcAdvicePrompt(value), /INVALID_PROMPT/)
  }
})

test('routes a bounded user prompt through the existing financial chat with no user-supplied roles or context', () => {
  assert.deepEqual(buildLtcAdviceChatPayload('Consejos de ahorro'), {
    messages: [{ role: 'user', content: 'Consejos de ahorro' }],
    context: { section: 'transactions' },
  })
})
