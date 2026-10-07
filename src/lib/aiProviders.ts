import { getVercelOidcToken } from '@vercel/oidc'

export type AiProvider = {
  id: string
  label: string
  baseUrl: string
  apiKey?: string
  model: string
  headers?: Record<string, string>
  fallbackModels?: string[]
  runtimeAuth?: 'vercel-oidc'
}

let providerCursor = Math.floor(Math.random() * 1000)

const cleanBaseUrl = (value: string) => value.replace(/\/$/, '')

const csv = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const configured = (
  id: string,
  label: string,
  baseUrl: string,
  apiKey?: string,
  model?: string,
  options: Pick<AiProvider, 'headers' | 'fallbackModels' | 'runtimeAuth'> = {},
): AiProvider | null => {
  if (!model || (!apiKey && !options.runtimeAuth)) return null

  return {
    id,
    label,
    baseUrl: cleanBaseUrl(baseUrl),
    apiKey,
    model,
    ...options,
  }
}

const namedProviders = (): AiProvider[] => {
  const openRouterHeaders: Record<string, string> = {}
  if (process.env.OPENROUTER_REFERER) {
    openRouterHeaders['HTTP-Referer'] = process.env.OPENROUTER_REFERER
  }
  if (process.env.OPENROUTER_APP_NAME) {
    openRouterHeaders['X-Title'] = process.env.OPENROUTER_APP_NAME
  }

  return [
    configured(
      'gateway',
      'Vercel AI Gateway',
      process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
      process.env.AI_GATEWAY_API_KEY,
      process.env.AI_GATEWAY_MODEL,
      {
        fallbackModels: csv(process.env.AI_GATEWAY_FALLBACK_MODELS),
        runtimeAuth: 'vercel-oidc',
      },
    ),
    configured(
      'groq',
      'Groq',
      process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      process.env.GROQ_API_KEY,
      process.env.GROQ_MODEL,
    ),
    configured(
      'openrouter',
      'OpenRouter',
      process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      process.env.OPENROUTER_API_KEY,
      process.env.OPENROUTER_MODEL,
      { headers: openRouterHeaders },
    ),
    configured(
      'nvidia',
      'NVIDIA NIM',
      process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      process.env.NVIDIA_API_KEY,
      process.env.NVIDIA_MODEL,
    ),
    configured(
      'google',
      'Google AI Studio',
      process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_MODEL,
    ),
    configured(
      'legacy',
      'Legacy provider',
      process.env.AI_BASE_URL || '',
      process.env.AI_API_KEY,
      process.env.AI_MODEL,
    ),
    configured(
      'legacy-fallback',
      'Legacy fallback',
      process.env.AI_FALLBACK_BASE_URL || '',
      process.env.AI_FALLBACK_API_KEY,
      process.env.AI_FALLBACK_MODEL,
    ),
  ].filter((provider): provider is AiProvider => Boolean(provider && provider.baseUrl))
}

const orderedProviders = () => {
  const providers = namedProviders()
  const requestedOrder = csv(process.env.AI_PROVIDER_ORDER)

  if (!requestedOrder.length) return providers

  const byId = new Map(providers.map((provider) => [provider.id, provider]))
  const ordered = requestedOrder
    .map((id) => byId.get(id))
    .filter((provider): provider is AiProvider => Boolean(provider))

  const included = new Set(ordered.map((provider) => provider.id))
  return [...ordered, ...providers.filter((provider) => !included.has(provider.id))]
}

export const resolveProviderAuthToken = async (provider: AiProvider) => {
  if (provider.apiKey) return provider.apiKey
  if (provider.runtimeAuth !== 'vercel-oidc') return ''

  try {
    return await getVercelOidcToken()
  } catch {
    return ''
  }
}

export const getConfiguredProviderSummary = async () => {
  const providers = orderedProviders()
  const available = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      authReady: Boolean(await resolveProviderAuthToken(provider)),
    })),
  )

  return available
    .filter(({ authReady }) => authReady)
    .map(({ provider: { id, label } }) => ({ id, label }))
}

export const getProviderAttemptOrder = () => {
  const providers = orderedProviders()
  if (providers.length < 2 || process.env.AI_PROVIDER_STRATEGY === 'ordered') {
    return providers
  }

  const startIndex = providerCursor % providers.length
  providerCursor = (providerCursor + 1) % Number.MAX_SAFE_INTEGER

  return [...providers.slice(startIndex), ...providers.slice(0, startIndex)]
}

export const getProviderTimeoutMs = () => {
  const parsed = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 12000)
  if (!Number.isFinite(parsed)) return 12000
  return Math.min(Math.max(parsed, 1000), 30000)
}
