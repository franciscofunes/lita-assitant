'use client'

import { useChat } from 'ai/react'
import {
  Bot,
  CheckCircle2,
  DollarSign,
  PieChart,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Wallet,
  WifiOff,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type FinancialContext = {
  section?: string
  [key: string]: unknown
}

type ProviderStatus = {
  ready: boolean
  providers: Array<{
    id: string
    label: string
  }>
}

const defaultParentOrigins = [
  'https://lleva-tus-cuentas.netlify.app',
  'http://localhost:3000',
]

const configuredParentOrigins = () =>
  (process.env.NEXT_PUBLIC_LITA_PARENT_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

const transactionPrompts = [
  'Resumí mis movimientos actuales',
  '¿En qué se me está yendo más dinero?',
  'Analizá mi balance del período',
]

const portfolioPrompts = [
  'Analizá la distribución de mi portfolio',
  '¿Dónde tengo más concentración?',
  'Resumí tasas, liquidez y rendimientos',
]

const genericPrompts = [
  'Resumí mi situación financiera',
  '¿Qué debería revisar primero?',
  'Detectá datos que debería verificar',
]

export function Chat() {
  const [financialContext, setFinancialContext] =
    useState<FinancialContext | null>(null)
  const [providerStatus, setProviderStatus] =
    useState<ProviderStatus | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const allowedParentOrigins = useMemo(
    () => new Set([...defaultParentOrigins, ...configuredParentOrigins()]),
    [],
  )

  useEffect(() => {
    const handleParentMessage = (event: MessageEvent) => {
      if (!allowedParentOrigins.has(event.origin)) return

      if (
        event.data?.type === 'lita:context' &&
        event.data?.payload &&
        typeof event.data.payload === 'object'
      ) {
        setFinancialContext(event.data.payload)
      }
    }

    window.addEventListener('message', handleParentMessage)
    window.parent.postMessage({ type: 'lita:ready' }, '*')

    return () => {
      window.removeEventListener('message', handleParentMessage)
    }
  }, [allowedParentOrigins])

  useEffect(() => {
    let active = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const refreshProviderStatus = async () => {
      try {
        const response = await fetch('/api/status', { cache: 'no-store' })
        if (!response.ok) throw new Error(`Status request failed: ${response.status}`)

        const status = (await response.json()) as ProviderStatus
        if (!active) return

        setProviderStatus(status)

        if (!status.ready) {
          retryTimer = setTimeout(refreshProviderStatus, 5000)
        }
      } catch {
        if (!active) return

        setProviderStatus({
          ready: false,
          providers: [],
        })
        retryTimer = setTimeout(refreshProviderStatus, 5000)
      }
    }

    const handleVisibilityOrFocus = () => {
      if (!active || document.visibilityState === 'hidden') return
      if (retryTimer) clearTimeout(retryTimer)
      void refreshProviderStatus()
    }

    void refreshProviderStatus()
    window.addEventListener('focus', handleVisibilityOrFocus)
    document.addEventListener('visibilitychange', handleVisibilityOrFocus)

    return () => {
      active = false
      if (retryTimer) clearTimeout(retryTimer)
      window.removeEventListener('focus', handleVisibilityOrFocus)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
    }
  }, [])

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    setInput,
  } = useChat({
    api: '/api/chat',
    body: {
      context: financialContext,
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages, isLoading])

  const contextLabel =
    financialContext?.section === 'portfolio'
      ? 'Portfolio'
      : financialContext?.section === 'transactions'
        ? 'Transacciones'
        : 'Sin contexto'

  const contextIcon =
    financialContext?.section === 'portfolio' ? (
      <PieChart className="h-3.5 w-3.5" />
    ) : financialContext?.section === 'transactions' ? (
      <Wallet className="h-3.5 w-3.5" />
    ) : (
      <DollarSign className="h-3.5 w-3.5" />
    )

  const quickPrompts =
    financialContext?.section === 'portfolio'
      ? portfolioPrompts
      : financialContext?.section === 'transactions'
        ? transactionPrompts
        : genericPrompts

  const providerLabel =
    providerStatus?.ready && providerStatus.providers.length
      ? providerStatus.providers.length === 1
        ? providerStatus.providers[0].label
        : `${providerStatus.providers.length} proveedores disponibles`
      : null

  return (
    <main className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-950/30">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-extrabold tracking-tight">
                  LITA
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                  {contextIcon}
                  {contextLabel}
                </span>
              </div>
              <p className="truncate text-xs text-slate-400">
                Tu asistente financiero de Lleva Tus Cuentas
              </p>
            </div>
          </div>

          <div
            className={[
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
              providerStatus?.ready
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : providerStatus
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400',
            ].join(' ')}
            title={providerLabel || 'Configuración de IA pendiente'}
          >
            {providerStatus?.ready ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : providerStatus ? (
              <WifiOff className="h-3.5 w-3.5" />
            ) : (
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
            )}
            <span className="hidden sm:inline">
              {providerStatus?.ready
                ? 'IA lista'
                : providerStatus
                  ? 'IA sin configurar'
                  : 'Comprobando'}
            </span>
          </div>
        </div>
      </header>

      <section className="lita-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col">
          {messages.length === 0 && (
            <div className="mb-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/10">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-white">
                      ¿Qué querés analizar?
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      Puedo trabajar con el contexto de {contextLabel.toLowerCase()}
                      {' '}que recibo desde LTC. No voy a inventar valores que no estén
                      disponibles.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-3 text-left text-sm font-semibold text-slate-200 transition hover:border-violet-500/60 hover:bg-violet-500/10"
                    >
                      <span>{prompt}</span>
                      <Send className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-violet-300" />
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs leading-relaxed text-slate-400">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>
                    LITA separa monedas, diferencia movimientos de ganancias y
                    trata proyecciones como escenarios, no como rendimientos
                    garantizados.
                  </span>
                </div>
              </div>

              {providerStatus && !providerStatus.ready && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
                  La interfaz está lista, pero todavía falta configurar al menos
                  un proveedor/modelo de IA en Vercel.
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {messages.map((message) => {
              const isUser = message.role === 'user'

              return (
                <div
                  key={message.id}
                  className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={[
                      'max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
                      isUser
                        ? 'rounded-br-md bg-violet-600 text-white'
                        : 'rounded-bl-md border border-slate-800 bg-slate-900 text-slate-200',
                    ].join(' ')}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                  </div>

                  {isUser && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              )
            })}

            {isLoading && (
              <div className="flex items-start gap-2.5">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-bl-md border border-slate-800 bg-slate-900 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:120ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:240ms]" />
                    <span className="ml-2 text-xs font-medium text-slate-400">
                      Analizando…
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-100">
                {providerStatus && !providerStatus.ready
                  ? 'No hay un proveedor de IA configurado todavía. Completá la configuración en Vercel y volvé a intentar.'
                  : 'LITA no pudo responder esta vez. El router intentará otro proveedor en la próxima consulta.'}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </section>

      <footer className="shrink-0 border-t border-slate-800 bg-slate-950/95 p-3.5 backdrop-blur sm:p-4">
        <form
          className="mx-auto flex w-full max-w-2xl items-end gap-2"
          onSubmit={handleSubmit}
        >
          <div className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 transition focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20">
            <textarea
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              disabled={isLoading || providerStatus?.ready === false}
              placeholder={
                providerStatus?.ready === false
                  ? 'Configurá un proveedor de IA para comenzar'
                  : 'Preguntale a LITA…'
              }
              className="max-h-28 min-h-[24px] w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500">
                Enter para enviar · Shift + Enter para nueva línea
              </span>
              {providerLabel && (
                <span className="hidden truncate text-[10px] text-slate-500 sm:block">
                  {providerLabel}
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={
              isLoading ||
              !input.trim() ||
              providerStatus?.ready === false
            }
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Enviar mensaje"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </footer>
    </main>
  )
}
