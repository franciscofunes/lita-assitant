import { OpenAIStream, StreamingTextResponse } from 'ai'

export const runtime = 'edge'

type Provider = {
  baseUrl: string
  apiKey: string
  model: string
}

function provider(prefix = 'AI'): Provider | null {
  const baseUrl = process.env[`${prefix}_BASE_URL`]
  const apiKey = process.env[`${prefix}_API_KEY`]
  const model = process.env[`${prefix}_MODEL`]

  if (!baseUrl || !apiKey || !model) return null

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    model
  }
}

async function completion(current: Provider, messages: unknown[]) {
  return fetch(`${current.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${current.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: current.model,
      stream: true,
      messages,
      max_tokens: 500,
      temperature: 0.2
    })
  })
}

export async function POST(req: Request) {
  const { messages } = await req.json()
  const primary = provider()
  const fallback = provider('AI_FALLBACK')

  if (!primary) {
    return new Response('AI provider is not configured', { status: 503 })
  }

  let response = await completion(primary, messages)

  if (fallback && (response.status === 429 || response.status >= 500)) {
    response = await completion(fallback, messages)
  }

  if (!response.ok) {
    // Deliberately do not return provider bodies: they can contain operational details.
    return new Response('AI provider request failed', { status: response.status })
  }

  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream)
}
