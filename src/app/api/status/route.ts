import { NextResponse } from 'next/server'
import { getConfiguredProviderSummary } from '@/lib/aiProviders'

export const dynamic = 'force-dynamic'

export async function GET() {
  const providers = getConfiguredProviderSummary()

  return NextResponse.json(
    {
      ready: providers.length > 0,
      providers,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
