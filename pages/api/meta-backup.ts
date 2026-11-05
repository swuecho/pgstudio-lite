import type { NextApiRequest, NextApiResponse } from 'next'
import { META_BACKUP_CONTENT_TYPE, createMetaBackup } from '@/lib/meta-backup'
import { methodNotAllowed, sendApiError } from '@/lib/api/errors'

/**
 * GET returns a consistent snapshot of the local metadata DB as a file
 * download. The file holds saved connection strings, so it is never cached.
 * The route takes no query or body.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  try {
    const { filename, bytes } = await createMetaBackup()
    res.setHeader('Content-Type', META_BACKUP_CONTENT_TYPE)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(bytes)
  } catch (error) {
    return sendApiError(res, error)
  }
}
