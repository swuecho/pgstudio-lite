import { META_BACKUP_CONTENT_TYPE, createMetaBackup } from '@/lib/meta-backup'
import { defineRoute } from '@/server/route'

/**
 * GET returns a consistent snapshot of the local metadata DB as a file
 * download. The file holds saved connection strings, so it is never cached.
 * The route takes no query or body.
 */
export default defineRoute({
  async GET() {
    const { filename, bytes } = await createMetaBackup()
    // Copy into a plain ArrayBuffer: a Node Buffer's backing store is typed
    // ArrayBufferLike, which BodyInit does not accept.
    const body = new Uint8Array(bytes.byteLength)
    body.set(bytes)
    return new Response(body.buffer, {
      status: 200,
      headers: {
        'Content-Type': META_BACKUP_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
})
