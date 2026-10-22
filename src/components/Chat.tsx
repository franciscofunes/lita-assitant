'use client'

import { useChat } from 'ai/react'
import {
  Bot,
  CheckCircle2,
  DollarSign,
  FileText,
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Streamdown } from 'streamdown'
import TransactionMarkdownWizard from '@/components/TransactionMarkdownWizard'
import { requestedFinancialPeriod } from '@/lib/financialPeriods'
import { assessFinancialScope } from '@/lib/financialScope'
import { sanitizeAssistantOutput } from '@/lib/financialConversation'

type SpendingCategory = {
  category: string
  totalArs: number
  transactionCount: number
  percentOfSpending?: number
}

type SpendingBreakdown = {
  currency: 'ARS'
  scope: 'current-view'
  totalArs: number
  transactionCount: number
  invalidAmountCount: number
  categories: SpendingCategory[]
}

type FinancialContext = {
  section?: string
  spendingByCategory?: SpendingBreakdown
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
const trustedLtcPreviewOrigin = /^https:\/\/deploy-preview-\d+--lleva-tus-cuentas\.netlify\.app$/

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

const banksPrompts = [
  'Compará el mes de mayor y menor consumo en todos mis resúmenes vinculados, separado en ARS y USD',
  '¿Qué tope mensual me recomendás para tarjetas según mis últimos resúmenes?',
  '¿Qué tarjetas tienen consumos o vencimientos?',
  'Resumí los saldos que registré en mis bancos',
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

// Do not rely on Streamdown's built-in table colors: the host controls dark
// mode across an iframe and Streamdown may inject light-only table classes.
// Streamdown v2 accepts either standard HTML props or its generic Markdown
// record props. Use an unknown boundary to support both prop contracts.
const markdownChildren = (props: unknown): ReactNode =>
  (props as { children?: ReactNode }).children

const financialTableCellContent = (props: unknown) => {
  const children = markdownChildren(props)
  const isEmpty = children === undefined || children === null ||
    (typeof children === 'string' && children.trim() === '') ||
    (Array.isArray(children) && children.length === 0)

  return isEmpty ? (
    <span title="La respuesta no incluyó este dato" className="text-amber-700 dark:text-amber-300">
      Dato no disponible
    </span>
  ) : children
}

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
})

const markdownComponents = {
  table: (props: unknown) => (
    <table className="lita-financial-table w-full border-collapse text-left text-xs sm:text-sm">
      {markdownChildren(props)}
    </table>
  ),
  thead: (props: unknown) => <thead>{markdownChildren(props)}</thead>,
  tbody: (props: unknown) => <tbody>{markdownChildren(props)}</tbody>,
  tr: (props: unknown) => <tr>{markdownChildren(props)}</tr>,
  th: (props: unknown) => (
    <th className="lita-financial-th border px-2.5 py-2 align-top font-semibold">{markdownChildren(props)}</th>
  ),
  td: (props: unknown) => (
    <td className="lita-financial-td border px-2.5 py-2 align-top">{financialTableCellContent(props)}</td>
  ),
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
  const [hostConnected, setHostConnected] = useState(false)
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>({ state: 'loading' })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [saveAttempt, setSaveAttempt] = useState(0)
  const pendingSaveRef = useRef<PendingSave | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChatThread | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const pendingDeleteRef = useRef<{requestId:string;id:string} | null>(null)
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeChatIdRef = useRef('')
  const [transactionWizardOpen, setTransactionWizardOpen] = useState(false)
  const [activeChatId, setActiveChatId] = useState('')
  const [activeCreatedAt, setActiveCreatedAt] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [visibleHeight, setVisibleHeight] = useState<number | null>(null)
  const parentOriginRef = useRef<string | null>(null)
  const lastSavedSignatureRef = useRef('')
  const pendingHistoricalRef = useRef<Map<string, (value: Record<string, unknown> | null) => void>>(new Map())
  const [readingHistory, setReadingHistory] = useState(false)
  const [pendingHistoricalPrompt, setPendingHistoricalPrompt] = useState<string | null>(null)
  const currentHostContextRef = useRef<FinancialContext | null>(null)

  const allowedParentOrigins = useMemo(
    () => new Set([...defaultParentOrigins, ...configuredParentOrigins()]),
    [],
  )

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
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

  // Inside an iframe, 100dvh may not track Android's software keyboard
  // synchronously. Size only the scrollable chat shell to the actual visual
  // viewport; its flex layout keeps the composer directly above the keyboard.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      const next = Math.round(viewport.height)
      if (next > 0) setVisibleHeight((previous) => previous === next ? previous : next)
    }
    update()
    viewport.addEventListener('resize', update)
    window.addEventListener('resize', update)
    return () => {
      viewport.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    setActiveChatId(createChatId())
    setActiveCreatedAt(new Date().toISOString())
  }, [])

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    const handleParentMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !(allowedParentOrigins.has(event.origin) || trustedLtcPreviewOrigin.test(event.origin))) return
      parentOriginRef.current = event.origin
      setHostConnected(true)

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
        currentHostContextRef.current = event.data.payload
        setFinancialContext(event.data.payload)
        return
      }

      if (event.data?.type === 'lita:historical:result') {
        const reply = event.data.payload
        const resolve = pendingHistoricalRef.current.get(reply?.requestId)
        if (resolve) {
          pendingHistoricalRef.current.delete(reply.requestId)
          resolve(reply.success === true && reply.result && typeof reply.result === 'object'
            ? reply.result as Record<string, unknown>
            : { error: String(reply.reason || 'No se pudieron consultar los movimientos.'), complete: false })
        }
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

      if (event.data?.type === 'lita:history:delete:result') {
        const response = event.data.payload
        const pending = pendingDeleteRef.current
        if (!pending || response?.requestId !== pending.requestId || response?.id !== pending.id) return
        if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current)
        deleteTimeoutRef.current = null
        pendingDeleteRef.current = null
        setDeletePending(false)
        if (response.success === true) {
          setHistoryThreads((current) => current.filter((thread) => thread.id !== pending.id))
          setDeleteTarget(null)
          setDeleteError('')
          if (pending.id === activeChatIdRef.current) {
            setMessages([])
            setInput('')
            setActiveChatId(createChatId())
            setActiveCreatedAt(new Date().toISOString())
            lastSavedSignatureRef.current = ''
            setSaveStatus('idle')
            setSaveError('')
          }
        } else {
          setDeleteError(response.reason === 'permission-denied'
            ? 'No tenés permiso para eliminar esta conversación. Revisá las reglas del historial.'
            : response.reason === 'unauthenticated'
              ? 'Iniciá sesión en LTC para eliminar conversaciones.'
              : 'No pudimos eliminar la conversación. Probá nuevamente.')
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
    if (!parentOrigin || !hostConnected) return
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
    }, 50)

    return () => clearTimeout(timer)
  }, [
    activeChatId,
    activeCreatedAt,
    financialContext?.section,
    hostConnected,
    isLoading,
    messages,
    saveAttempt,
  ])

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current)
  }, [])

  const retrySave = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    pendingSaveRef.current = null
    setSaveStatus('idle')
    setSaveError('')
    setSaveAttempt((attempt) => attempt + 1)
  }

  const requestHistorical = async (from: string, to: string): Promise<Record<string, unknown> | null> => {
    const origin = parentOriginRef.current
    if (!origin || window.parent === window) return null
    const requestId = [Date.now().toString(36), Math.random().toString(36).slice(2, 10)].join('-')
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pendingHistoricalRef.current.delete(requestId)
        resolve(null)
      }, 10000)
      pendingHistoricalRef.current.set(requestId, (value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      window.parent.postMessage({
        type: 'lita:historical:request', payload: { requestId, from, to },
      }, origin)
    })
  }

  // AI SDK 2.x accepts context only at hook initialization, not as an
  // append() option. Render the historical context first, then enqueue the
  // message in this effect so the hook uses the newest body.
  useEffect(() => {
    if (!pendingHistoricalPrompt || financialContext?.scope !== 'historical-query') return
    const question = pendingHistoricalPrompt
    setPendingHistoricalPrompt(null)
    append({ role: 'user', content: question })
      .finally(() => {
        setFinancialContext(currentHostContextRef.current)
        setReadingHistory(false)
      })
  }, [append, financialContext, pendingHistoricalPrompt])

  const submitFinancialMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    const question = input.trim()
    if (!question || isLoading || readingHistory) {
      event.preventDefault()
      return
    }
    const period = financialContext?.section === 'transactions' &&
      assessFinancialScope(question) === 'allowed'
      ? requestedFinancialPeriod(question) : null
    if (!period) {
      handleSubmit(event)
      return
    }
    event.preventDefault()
    setReadingHistory(true)
    try {
      const history = await requestHistorical(period.from, period.to)
      if (!history || history.complete !== true) {
        const errorText = history?.error
          ? String(history.error)
          : 'No pude consultar el período solicitado. Abrí LITA desde Transacciones e intentá de nuevo.'
        setInput('')
        setMessages([
          ...messages,
          { id: createChatId(), role: 'user', content: question },
          { id: createChatId(), role: 'assistant', content: errorText },
        ])
        setReadingHistory(false)
        return
      }
      const context = {
        section: 'transactions',
        scope: 'historical-query',
        historicalAnalysis: history,
      }
      // The useChat hook must first re-render with this dated context.
      // The effect above appends the question after that render.
      setInput('')
      setFinancialContext(context)
      setPendingHistoricalPrompt(question)
      return
    } catch {
      setReadingHistory(false)
      setInput('')
      setMessages([
        ...messages,
        { id: createChatId(), role: 'user', content: question },
        { id: createChatId(), role: 'assistant', content: 'No pude completar la consulta histórica. Intentá nuevamente.' },
      ])
    }
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

  // The parent is the only authorized Firestore writer. Never remove a thread
  // from the UI before it confirms deletion; errors must remain retryable.
  const deleteThread = () => {
    const target = deleteTarget
    if (!target || pendingDeleteRef.current) return
    const origin = parentOriginRef.current
    if (!origin) {
      setDeleteError('Abrí LITA desde Lleva Tus Cuentas para eliminar una conversación.')
      return
    }
    const requestId = createChatId()
    pendingDeleteRef.current = { requestId, id: target.id }
    setDeletePending(true)
    setDeleteError('')
    window.parent.postMessage({
      type: 'lita:history:delete',
      payload: { requestId, id: target.id },
    }, origin)
    if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current)
    deleteTimeoutRef.current = setTimeout(() => {
      if (pendingDeleteRef.current?.requestId !== requestId) return
      pendingDeleteRef.current = null
      setDeletePending(false)
      setDeleteError('LTC no confirmó la eliminación. Reintentá.')
    }, 10000)
  }

  useEffect(() => {
    if (!deleteTarget) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (!pendingDeleteRef.current) {
        setDeleteTarget(null)
        setDeleteError('')
      }
    }
    window.addEventListener('keydown', onEscape, true)
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [deleteTarget])

  const contextLabel =
    financialContext?.section === 'portfolio'
      ? 'Portfolio'
      : financialContext?.section === 'transactions'
        ? 'Transacciones'
        : financialContext?.section === 'banks'
          ? 'Bancos'
          : 'Sin contexto'

  const contextIcon =
    financialContext?.section === 'portfolio' ? (
      <PieChart className="h-3.5 w-3.5" />
    ) : financialContext?.section === 'transactions' || financialContext?.section === 'banks' ? (
      <Wallet className="h-3.5 w-3.5" />
    ) : (
      <DollarSign className="h-3.5 w-3.5" />
    )

  const quickPrompts =
    financialContext?.section === 'portfolio'
      ? portfolioPrompts
      : financialContext?.section === 'transactions'
        ? transactionPrompts
        : financialContext?.section === 'banks'
          ? banksPrompts
          : genericPrompts

  const verifiedSpending = financialContext?.section === 'transactions' &&
    financialContext.spendingByCategory?.currency === 'ARS'
      ? financialContext.spendingByCategory
      : null

  const providerLabel =
    providerStatus?.ready && providerStatus.providers.length
      ? providerStatus.providers.length === 1
        ? providerStatus.providers[0].label
        : `${providerStatus.providers.length} proveedores disponibles`
      : null

  const suppliedWizardCategories = financialContext?.categories
  const wizardCategories = (Array.isArray(suppliedWizardCategories) ? suppliedWizardCategories : [])
    .filter((entry): entry is { name: string; isExpense?: boolean } =>
      Boolean(entry && typeof entry === 'object' && 'name' in entry && typeof entry.name === 'string'))
    .map((entry) => ({ name: entry.name, isExpense: entry.isExpense === true }))

  return (
    <main data-testid="lita-chat-shell" style={visibleHeight ? { height: visibleHeight } : undefined} className="relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-gray-900 dark:text-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800 sm:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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

          <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
            {financialContext?.section === 'transactions' && (
              <button
                type="button"
                onClick={() => setTransactionWizardOpen(true)}
                aria-label="Preparar transacción con Markdown"
                title="Preparar transacción con Markdown"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-300 bg-violet-50 text-violet-800 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-700 dark:bg-slate-900 dark:text-violet-200 dark:hover:bg-slate-700"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={startNewChat}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-900 transition hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
              aria-label="Nueva conversación"
              title="Nueva conversación"
            >
              <Plus className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-900 transition hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
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
                'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold',
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

      {financialContext?.privacyHidden === true && (
        <div role="status" className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200">
          Modo privacidad activo: LITA no recibe los importes ni el historial de esta pantalla. Para analizar tus datos, cerrá el chat y volvé a mostrar los importes en LTC.
        </div>
      )}
      <section className="lita-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto flex w-full max-w-2xl flex-col">
          {messages.length === 0 && (
            <div className="mb-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
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

                {financialContext?.section === 'transactions' && (
                  <button type="button" onClick={() => setTransactionWizardOpen(true)}
                    className="mt-4 flex w-full items-center justify-between rounded-xl border border-violet-400/40 bg-violet-500/10 px-3.5 py-3 text-left text-sm font-semibold text-violet-800 transition hover:bg-violet-500/15 dark:text-violet-200">
                    <span>Preparar una transacción con Markdown</span>
                    <FileText className="h-4 w-4 shrink-0" />
                  </button>
                )}
                <div className="mt-4 grid gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="group flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-left text-sm font-semibold text-slate-800 transition hover:border-violet-500/60 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-700"
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
              // Do not re-display leaked reasoning from previously saved chats.
              const displayContent = isUser ? message.content :
                sanitizeAssistantOutput(message.content) ||
                'La respuesta anterior no contenía un resultado final seguro. Podés pedirle a LITA que continúe el análisis.'
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
                        : 'rounded-bl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                    ].join(' ')}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                    ) : (
                      <div className="lita-markdown min-w-0 overflow-hidden">
                        <Streamdown
                          components={markdownComponents}
                          caret="circle"
                          isAnimating={isStreamingAssistant}
                        >
                          {displayContent}
                        </Streamdown>
                        {!isLoading && verifiedSpending &&
                          index === messages.length - 1 &&
                          /gast|egres|consum|dinero|presupuesto|categor[ií]a/i.test(
                            [...messages.slice(0, index)].reverse().find((entry) => entry.role === 'user')?.content || '',
                          ) && (
                            <div className="mt-4 rounded-xl border border-emerald-600/25 bg-emerald-50 p-3 text-xs text-slate-800 dark:border-emerald-500/25 dark:bg-emerald-950/20 dark:text-slate-200">
                              <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                                Gastos calculados por LTC · ARS
                              </p>
                              {verifiedSpending.categories.length > 0 ? (
                                <ul className="mt-2 space-y-2">
                                  {verifiedSpending.categories.slice(0, 3).map((entry) => (
                                    <li key={entry.category} className="flex items-start justify-between gap-3">
                                      <span className="min-w-0 break-words">{entry.category}</span>
                                      <span className="shrink-0 font-bold tabular-nums">
                                        {arsFormatter.format(entry.totalArs)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2">No hay gastos con importes válidos en la vista actual.</p>
                              )}
                              <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
                                Totales del período visible en Transacciones. Un resumen de tarjeta representa el pago registrado, no las compras individuales.
                              </p>
                            </div>
                          )}
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
                  <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
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

      <footer data-testid="lita-chat-composer" className="relative z-10 shrink-0 border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 pt-2.5 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur sm:p-4">
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
          onSubmit={submitFinancialMessage}
        >
          <div className="min-w-0 flex-1 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 transition focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20">
            <textarea
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(event) => {
                // Android IME may dispatch Enter while composing a suggestion.
                if (event.nativeEvent.isComposing || event.keyCode === 229) return
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              disabled={isLoading || readingHistory || providerStatus?.ready === false}
              placeholder={
                providerStatus?.ready === false
                  ? 'Esperando un proveedor de IA…'
                  : 'Preguntale a LITA…'
              }
              className="max-h-28 min-h-[24px] w-full resize-none bg-transparent text-base sm:text-sm leading-6 text-slate-900 dark:text-white outline-none placeholder:text-slate-500 dark:placeholder:text-slate-500 disabled:cursor-not-allowed"
            />
            <div className="mt-1 hidden items-center justify-between gap-2 sm:flex">
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
              readingHistory ||
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

      {transactionWizardOpen && (
        <TransactionMarkdownWizard
          categories={wizardCategories}
          onClose={() => setTransactionWizardOpen(false)}
        />
      )}

      {historyOpen && (
        <section className="absolute inset-0 z-40 flex min-h-0 flex-col bg-slate-50 dark:bg-gray-900">
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
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-900 transition hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
              aria-label="Cerrar historial"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex shrink-0 gap-2 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
            <button
              type="button"
              onClick={startNewChat}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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
                  {historyStatus.reason === 'privacy-hidden' ? 'Historial oculto por privacidad' : 'No se pudo cargar el historial'}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {historyStatus.reason === 'privacy-hidden'
                    ? 'Volvé a mostrar los importes en LTC para consultar tus conversaciones guardadas.'
                    : historyStatus.reason === 'permission-denied'
                      ? 'Firestore rechazó la lectura. Revisá las reglas del historial de LITA.'
                    : historyStatus.reason === 'unauthenticated'
                      ? 'Iniciá sesión en Lleva Tus Cuentas para ver tus conversaciones.'
                      : 'No pudimos consultar tus conversaciones. Intentá nuevamente.'}
                </p>
                {historyStatus.reason !== 'privacy-hidden' && (
                <button type="button" onClick={refreshHistory}
                  className="mt-4 min-h-[44px] rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                  Reintentar
                </button>
                )}
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
                        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => loadThread(thread)}
                      className="min-h-[44px] min-w-0 flex-1 rounded-xl px-2 py-2 text-left transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:bg-slate-700"
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
                              : thread.section === 'banks'
                                ? 'Bancos'
                                : 'General'}
                        </span>
                        <span>{formatHistoryDate(thread.updatedAt)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteTarget(thread); setDeleteError('') }}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      aria-label={`Eliminar ${thread.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {deleteTarget && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-5">
              <section role="alertdialog" aria-modal="true" aria-labelledby="lita-delete-title" aria-describedby="lita-delete-description"
                onKeyDown={(event) => {
                  if (event.key !== 'Tab') return
                  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
                  if (!buttons.length) return
                  const first = buttons[0], last = buttons[buttons.length - 1]
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault()
                    last.focus()
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault()
                    first.focus()
                  }
                }}
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 sm:p-5">
                <h2 id="lita-delete-title" className="break-words text-xl font-extrabold">
                  ¿Eliminar esta conversación?
                </h2>
                <p id="lita-delete-description" className="mt-2 break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  Se eliminará «{deleteTarget.title}» de tu historial de LTC.
                  Esta acción no se puede deshacer.
                </p>
                {deleteError && <p role="alert" className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{deleteError}</p>}
                <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row sm:justify-end">
                  <button type="button" autoFocus disabled={deletePending}
                    onClick={() => { setDeleteTarget(null); setDeleteError('') }}
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                    Cancelar
                  </button>
                  <button type="button" disabled={deletePending} onClick={deleteThread}
                    className="min-h-[44px] rounded-xl border border-rose-400 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                    {deletePending ? 'Eliminando…' : 'Eliminar conversación'}
                  </button>
                </div>
              </section>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
