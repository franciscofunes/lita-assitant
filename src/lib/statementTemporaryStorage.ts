import { initEdgeStore } from '@edgestore/server'
import { initEdgeStoreClient } from '@edgestore/server/core'

/**
 * This bucket is exclusively accessed by this server-side parser.
 * There is intentionally NO public EdgeStore upload route.
 * The per-user protected path is a second defense in addition to token
 * verification; nothing in LTC ever receives a file URL.
 */
const es = initEdgeStore.context<{ userId: string }>().create()
const edgeStoreRouter = es.router({
  statementPdfs: es.fileBucket({ maxSize: 4 * 1024 * 1024, accept: ['application/pdf'] })
    .path(({ ctx }) => [{ author: ctx.userId }])
    .accessControl({ userId: { path: 'author' } }),
})

const getBackendClient = () => initEdgeStoreClient({ router: edgeStoreRouter })

export async function storeTemporaryStatement(bytes: Uint8Array, uid: string) {
  if (!process.env.EDGE_STORE_ACCESS_KEY || !process.env.EDGE_STORE_SECRET_KEY) {
    throw new Error('EDGE_STORE_NOT_CONFIGURED')
  }
  const uploaded = await getBackendClient().statementPdfs.upload({
    content: { blob: new Blob([Buffer.from(bytes)], { type: 'application/pdf' }), extension: 'pdf' },
    options: { temporary: true },
    ctx: { userId: uid },
  })
  return uploaded.url
}

export async function deleteTemporaryStatement(url: string) {
  // No client can request deletion of an arbitrary URL.
  await getBackendClient().statementPdfs.deleteFile({ url })
}
