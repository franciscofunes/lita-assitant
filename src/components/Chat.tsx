'use client'

import { useChat } from 'ai/react'
import {
  Bot,
  CheckCircle2,
  DollarSign,
  History,
  PieChart,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Streamdown } from 'streamdown'

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

type StoredChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type HistoryStatus = {
  state: 'loading' | 'ready' | 'error' | 'unavailable'
  reason?: string
}

type PendingSave = {
  requestId: string
  id: string
  signature: string
}

type ChatThread = {
  id: string
  title: string
  section: string
  messages: StoredChatMessage[]
  createdAt: string | null
  updatedAt: string | null
}

const defaultParentOrigins = [
  'https://lleva-tus-cuentas.netlify.app',
  'http://localhost:3000',
]

// Netlify deploy previews belong to this exact LTC site; other Netlify sites
// and arbitrary origins are not trusted.
const trustedLtcPreviewOrigin = /^https:\/\/deploy-preview-\\d+--lleva-tus-cuentas\\.netlify\\.app$/

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

const createChatId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `lita-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const normalizeStoredMessages = (messages: unknown): StoredChatMessage[] => {
  if (!Array.isArray(messages)) return []

  return messages
    .filter(
      (message): message is StoredChatMessage =>
        Boolean(
          message &&
            typeof message === 'object' &&
            'role' in message &&
            'content' in message &&
            ['user', 'assistant'].includes(
              String((message as StoredChatMessage).role),
            ) &&
            typeof (message as StoredChatMessage).content === 'string',
        ),
    )
    .slice(-40)
    .map((message, index) => ({
      id: String(message.id || `history-${index}`),
      role: message.role,
      content: message.content,
    }))
}

const normalizeHistory = (value: unknown): ChatThread[] => {
  if (!Array.isArray(value)) return []

  return value
    .filter(
      (thread) =>
        Boolean(
          thread &&
            typeof thread === 'object' &&
            'id' in thread &&
            typeof (thread as ChatThread).id === 'string',
        ),
    )
    .slice(0, 20)
    .map((thread) => {
      const row = thread as ChatThread
      return {
        id: row.id,
        title:
          typeof row.title === 'string' && row.title.trim()
            ? row.title
            : 'Conversación con LITA',
        section:
          typeof row.section === 'string' ? row.section : 'financial',
        messages: normalizeStoredMessages(row.messages),
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
      }
    })
}

const historySignature = (messages: StoredChatMessage[]) =>
  JSON.stringify(
    messages.map(({ role, content }) => ({
      role,
      content,
    })),
  )

const threadTitle = (messages: StoredChatMessage[]) => {
  const firstUserMessage = messages.find((message) => message.role === 'user')
  if (!firstUserMessage) return 'Conversación con LITA'

  const compact = firstUserMessage.content.replace(/\s+/g, ' ').trim()
  return compact.length > 64 ? `${compact.slice(0, 61)}…` : compact
}

const formatHistoryDate = (value: string | null) => {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'

  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function Chat() {
  const [financialContext, setFinancialContext] =
    useState<FinancialContext | null>(null)
  const [providerStatus, setProviderStatus] =
    useState<ProviderStatus | null>(null)
  const [historyThreads, setHistoryThreads] = useState<ChatThread[]>([])
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>({ state: 'loading' })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [saveAttempt, setSaveAttempt] = useState(0)
  const pendingSaveRef = useRef<PendingSave | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activeChatId, setActiveChatId] = useState('')
  const [activeCreatedAt, setActiveCreatedAt] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const parentOriginRef = useRef<string | null>(null)
  const lastSavedSignatureRef = useRef('')

  const allowedParentOrigins = useMemo(
    () => new Set([...defaultParentOrigins, ...configuredParentOrigins()]),
    [],
  )

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    setInput,
    setMessages,
  } = useChat({
    api: '/api/chat',
    body: {
      context: financialContext,
    },
  })

  useEffect(() => {
    setActiveChatId(createChatId())
    setActiveCreatedAt(new Date().toISOString())
  }, [])

  useEffect(() => {
    const handleParentMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !(allowedParentOrigins.has(event.origin) || trustedLtcPreviewOrigin.test(event.origin))) return
      parentOriginRef.current = event.origin

      if (event.data?.type === 'lita:theme') {
        if (event.data.payload !== 'dark' && event.data.payload !== 'light') return
        document.documentElement.classList.toggle('dark', event.data.payload === 'dark')
        document.documentElement.style.colorScheme = event.data.payload
        return
      }

      if (
        event.data?.type === 'lita:context' &&
        event.data?.payload &&
        typeof event.data.payload === 'object'
      ) {
        setFinancialContext(event.data.payload)
        return
      }

      if (event.data?.type === 'lita:history') {
        setHistoryThreads(normalizeHistory(event.data.payload))
        return
      }

      if (event.data?.type === 'lita:history:status') {
        const status = event.data.payload as HistoryStatus | undefined
        if (status && ['loading', 'ready', 'error', 'unavailable'].includes(status.state)) {
          setHistoryStatus({ state: status.state, reason: status.reason })
        }
        return
      }

      if (event.data?.type === 'lita:history:save:result') {
        const result = event.data.payload
        const pending = pendingSaveRef.current
        if (!pending || result?.requestId !== pending.requestId || result?.id !== pending.id) return
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
        pendingSaveRef.current = null
        if (result.success === true) {
          lastSavedSignatureRef.current = pending.signature
          setSaveStatus('saved')
          setSaveError('')
        } else {
          setSaveStatus('error')
          setSaveError(result.reason === 'permission-denied'
            ? 'Firestore no permite guardar el historial. Revisá las reglas de seguridad.'
            : result.reason === 'unauthenticated'
              ? 'Iniciá sesión en LTC para guardar esta conversación.'
              : 'No se pudo guardar el chat en tu cuenta. Podés reintentar.')
        }
      }
    }

    window.addEventListener('message', handleParentMessage)
    window.parent.postMessage({ type: 'lita:ready' }, '*')

    return () => {
      window.removeEventListener('message', handleParentMessage)
    }
  }, [allowedParentOrigins])

  // Standalone LITA follows the OS; embedded LITA follows only the trusted host.
  useEffect(() => {
    if (window.parent !== window) return

    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const updateTheme = () => {
      document.documentElement.classList.toggle('dark', preference.matches)
      document.documentElement.style.colorScheme = preference.matches ? 'dark' : 'light'
    }
    updateTheme()
    preference.addEventListener('change', updateTheme)
    return () => preference.removeEventListener('change', updateTheme)
  }, [])

  useEffect(() => {
    let active = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const refreshProviderStatus = async () => {
      try {
        const response = await fetch('/api/status', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Status request failed: ${response.status}`)
        }

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages, isLoading])

  useEffect(() => {
    if (isLoading || !activeChatId || !messages.length) return

    const storedMessages = normalizeStoredMessages(messages)
    const signature = historySignature(storedMessages)
    if (!signature || signature === lastSavedSignatureRef.current) return

    const parentOrigin = parentOriginRef.current
    if (!parentOrigin) return
    if (pendingSaveRef.current?.signature === signature) return

    const timer = setTimeout(() => {
      const requestId = createChatId()
      pendingSaveRef.current = { requestId, id: activeChatId, signature }
      setSaveStatus('saving')
      setSaveError('')
      window.parent.postMessage(
        {
          type: 'lita:history:save',
          payload: {
            requestId,
            id: activeChatId,
            title: threadTitle(storedMessages),
            section: financialContext?.section || 'financial',
            messages: storedMessages,
            createdAt: activeCreatedAt || new Date().toISOString(),
          },
        },
        parentOrigin,
      )
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        if (pendingSaveRef.current?.requestId !== requestId) return
        pendingSaveRef.current = null
        setSaveStatus('error')
        setSaveError('El guardado no fue confirmado. Podés reintentar.')
      }, 10000)
    }, 650)

    return () => clearTimeout(timer)
  }, [
    activeChatId,
    activeCreatedAt,
    financialContext?.section,
    isLoading,
    messages,
    saveAttempt,
  ])

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
  }, [])

  const retrySave = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    pendingSaveRef.current = null
    setSaveStatus('idle')
    setSaveError('')
    setSaveAttempt((attempt) => attempt + 1)
  }

  const refreshHistory = () => {
    const parentOrigin = parentOriginRef.current
    if (!parentOrigin) return
    setHistoryStatus({ state: 'loading' })
    window.parent.postMessage({ type: 'lita:history:refresh' }, parentOrigin)
  }

  const startNewChat = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    pendingSaveRef.current = null
    setSaveStatus('idle')
    setSaveError('')
    setMessages([])
    setInput('')
    setActiveChatId(createChatId())
    setActiveCreatedAt(new Date().toISOString())
    lastSavedSignatureRef.current = ''
    setHistoryOpen(false)
  }

  const loadThread = (thread: ChatThread) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    pendingSaveRef.current = null
    setSaveStatus('saved')
    setSaveError('')
    const restoredMessages = normalizeStoredMessages(thread.messages)
    setMessages(restoredMessages)
    setInput('')
    setActiveChatId(thread.id)
    setActiveCreatedAt(thread.createdAt || new Date().toISOString())
    lastSavedSignatureRef.current = historySignature(restoredMessages)
    setHistoryOpen(false)
  }

  const deleteThread = (threadId: string) => {
    const parentOrigin = parentOriginRef.current
    if (parentOrigin) {
      window.parent.postMessage(
        {
          type: 'lita:history:delete',
          payload: { id: threadId },
        },
        parentOrigin,
      )
    }

    setHistoryThreads((current) =>
      current.filter((thread) => thread.id !== threadId),
    )

    if (threadId === activeChatId) {
      startNewChat()
    }
  }

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
    <main className="relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 px-4 py-3 backdrop-blur">
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
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-100">
                  {contextIcon}
                  {contextLabel}
                </span>
              </div>
              <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                Tu asistente financiero de Lleva Tus Cuentas
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={startNewChat}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 transition hover:border-violet-400/60 hover:bg-violet-500/10 hover:text-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="Nueva conversación"
              title="Nueva conversación"
            >
              <Plus className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 transition hover:border-violet-400/60 hover:bg-violet-500/10 hover:text-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="Historial de conversaciones"
              title="Historial"
            >
              <History className="h-4 w-4" />
              {historyThreads.length > 0 && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-violet-400" />
              )}
            </button>

            <div
              className={[
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-[11px] font-semibold',
                providerStatus?.ready
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : providerStatus
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400',
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
        </div>
      </header>

      <section className="lita-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col">
          {messages.length === 0 && (
            <div className="mb-6">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-5 shadow-xl shadow-black/10">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-300">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-950 dark:text-white">
                      ¿Qué querés analizar?
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
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
                      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-950/70 px-3.5 py-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-200 transition hover:border-violet-500/60 hover:bg-violet-500/10"
                    >
                      <span>{prompt}</span>
                      <Send className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-500 transition group-hover:text-violet-300" />
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>
                    LITA separa monedas, diferencia movimientos de ganancias y
                    trata proyecciones como escenarios, no como rendimientos
                    garantizados.
                  </span>
                </div>
              </div>

              {providerStatus && !providerStatus.ready && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-100">
                  LITA no detecta un proveedor de IA disponible todavía. Se
                  volverá a comprobar automáticamente.
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {messages.map((message, index) => {
              const isUser = message.role === 'user'
              const isStreamingAssistant =
                isLoading &&
                index === messages.length - 1 &&
                message.role === 'assistant'

              return (
                <div
                  key={message.id}
                  className={`flex items-start gap-2.5 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isUser && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-500/15 text-violet-700 dark:text-violet-100">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={[
                      'min-w-0 max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
                      isUser
                        ? 'rounded-br-md bg-violet-600 text-white'
                        : 'rounded-bl-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
                    ].join(' ')}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                    ) : (
                      <div className="lita-markdown min-w-0 overflow-hidden">
                        <Streamdown
                          caret="circle"
                          isAnimating={isStreamingAssistant}
                        >
                          {message.content}
                        </Streamdown>
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-800 text-white dark:border-slate-600">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              )
            })}

            {isLoading &&
              !messages.some(
                (message, index) =>
                  index === messages.length - 1 &&
                  message.role === 'assistant' &&
                  message.content,
              ) && (
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-500/15 text-violet-700 dark:text-violet-100">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl rounded-bl-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:120ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:240ms]" />
                      <span className="ml-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                        Analizando…
                      </span>
                    </div>
                  </div>
                </div>
              )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-800 dark:text-red-100">
                {providerStatus && !providerStatus.ready
                  ? 'No hay un proveedor de IA disponible todavía. LITA volverá a comprobar la configuración automáticamente.'
                  : 'LITA no pudo responder esta vez. El router intentará otro proveedor en la próxima consulta.'}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </section>

      <footer className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 p-3.5 backdrop-blur sm:p-4">
        {saveStatus !== 'idle' && (
          <div role={saveStatus === 'error' ? 'alert' : 'status'} className="mx-auto mb-2 flex w-full max-w-2xl items-center justify-between gap-2 text-xs">
            <span className={saveStatus === 'error'
              ? 'text-red-700 dark:text-red-300'
              : 'text-slate-600 dark:text-slate-400'}>
              {saveStatus === 'saving' ? 'Guardando conversación…'
                : saveStatus === 'saved' ? 'Conversación guardada'
                  : saveError}
            </span>
            {saveStatus === 'error' && (
              <button type="button" onClick={retrySave}
                className="shrink-0 rounded-lg border border-red-500/40 px-2 py-1 font-semibold text-red-700 dark:text-red-200">
                Reintentar guardado
              </button>
            )}
          </div>
        )}
        <form
          className="mx-auto flex w-full max-w-2xl items-end gap-2"
          onSubmit={handleSubmit}
        >
          <div className="min-w-0 flex-1 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 transition focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20">
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
                  ? 'Esperando un proveedor de IA…'
                  : 'Preguntale a LITA…'
              }
              className="max-h-28 min-h-[24px] w-full resize-none bg-transparent text-sm leading-6 text-slate-900 dark:text-white outline-none placeholder:text-slate-500 dark:placeholder:text-slate-500 disabled:cursor-not-allowed"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500 dark:text-slate-500">
                Enter para enviar · Shift + Enter para nueva línea
              </span>
              {providerLabel && (
                <span className="hidden truncate text-[10px] text-slate-500 dark:text-slate-500 sm:block">
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

      {historyOpen && (
        <section className="absolute inset-0 z-40 flex min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-950 dark:text-white">
                Historial de LITA
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Conversaciones guardadas en tu cuenta de LTC
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition hover:border-violet-400/60 hover:bg-violet-500/10 hover:text-violet-100"
              aria-label="Cerrar historial"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex shrink-0 gap-2 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
            <button
              type="button"
              onClick={startNewChat}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500"
            >
              <Plus className="h-4 w-4" />
              Nueva conversación
            </button>
          </div>

          <div className="lita-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            {historyStatus.state === 'loading' ? (
              <p role="status" className="p-6 text-center text-sm text-slate-600 dark:text-slate-300">
                Cargando conversaciones…
              </p>
            ) : historyStatus.state === 'error' || historyStatus.state === 'unavailable' ? (
              <div role="alert" className="rounded-2xl border border-amber-500/40 p-5 text-center">
                <p className="font-bold text-slate-900 dark:text-white">
                  No se pudo cargar el historial
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {historyStatus.reason === 'permission-denied'
                    ? 'Firestore rechazó la lectura. Revisá las reglas del historial de LITA.'
                    : historyStatus.reason === 'unauthenticated'
                      ? 'Iniciá sesión en Lleva Tus Cuentas para ver tus conversaciones.'
                      : 'No pudimos consultar tus conversaciones. Intentá nuevamente.'}
                </p>
                <button type="button" onClick={refreshHistory}
                  className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">
                  Reintentar
                </button>
              </div>
            ) : historyThreads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-900/50 px-4 py-8 text-center">
                <History className="mx-auto h-5 w-5 text-slate-500 dark:text-slate-500" />
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                  Todavía no hay conversaciones guardadas
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                  El historial aparece después de tu primera respuesta de LITA.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {historyThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className={[
                      'flex items-stretch gap-2 rounded-2xl border p-2',
                      thread.id === activeChatId
                        ? 'border-violet-500/50 bg-violet-500/10'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => loadThread(thread)}
                      className="min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-200 dark:hover:bg-slate-800/70"
                    >
                      <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                        {thread.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-500">
                        <span className="rounded-full border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 uppercase tracking-wide text-slate-600 dark:text-slate-400">
                          {thread.section === 'portfolio'
                            ? 'Portfolio'
                            : thread.section === 'transactions'
                              ? 'Transacciones'
                              : 'General'}
                        </span>
                        <span>{formatHistoryDate(thread.updatedAt)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteThread(thread.id)}
                      className="inline-flex w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                      aria-label={`Eliminar ${thread.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
