'use client'

import { useChat } from 'ai/react'
import { useEffect, useMemo, useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'

type FinancialContext = {
  section?: string
  [key: string]: unknown
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

export function Chat() {
  const [financialContext, setFinancialContext] =
    useState<FinancialContext | null>(null)

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

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
  } = useChat({
    api: '/api/chat',
    body: {
      context: financialContext,
    },
  })

  const contextLabel =
    financialContext?.section === 'portfolio'
      ? 'Portfolio'
      : financialContext?.section === 'transactions'
        ? 'Transacciones'
        : null

  return (
    <Card className="flex h-screen w-full flex-col rounded-none border-0 bg-white shadow-none">
      <CardHeader className="border-b border-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>LITA</CardTitle>
            <CardDescription>Tu asistente financiero</CardDescription>
          </div>
          {contextLabel && (
            <span className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
              {contextLabel}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-4">
        <ScrollArea className="h-full w-full pr-4">
          {messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Preguntame por tus movimientos, balance o inversiones. Voy a usar
              solamente el contexto disponible en Lleva Tus Cuentas.
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className="mb-4 flex gap-2 text-sm text-slate-600"
            >
              {message.role === 'user' && (
                <Avatar>
                  <AvatarFallback>US</AvatarFallback>
                  <AvatarImage src="https://api.multiavatar.com/Satoshi Bond.png" />
                </Avatar>
              )}

              {message.role === 'assistant' && (
                <Avatar>
                  <AvatarFallback>LI</AvatarFallback>
                  <AvatarImage src="https://api.multiavatar.com/Lita.png" />
                </Avatar>
              )}

              <p className="leading-relaxed">
                <span className="block font-bold text-slate-800">
                  {message.role === 'user' ? 'Usuario' : 'LITA'}:
                </span>
                {message.content}
              </p>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="h-2 w-2 animate-bounce rounded-full bg-purple-500" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-purple-500 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-purple-500 [animation-delay:240ms]" />
              <span className="ml-1">LITA está analizando…</span>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              No pude responder ahora. Probá nuevamente en unos segundos.
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <CardFooter className="border-t border-slate-200 p-4">
        <form className="flex w-full gap-2" onSubmit={handleSubmit}>
          <Input
            type="text"
            placeholder="¿Cómo puedo ayudarte?"
            value={input}
            onChange={handleInputChange}
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            Enviar
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}
