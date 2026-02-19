import type { NextApiRequest, NextApiResponse } from 'next'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const STUDIO_MONACO_DIR = join(process.cwd(), '..', 'studio', 'public', 'monaco-editor')

function contentTypeFor(pathname: string) {
  const ext = extname(pathname).toLowerCase()
  return (
    {
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.ttf': 'font/ttf',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    }[ext] || 'application/octet-stream'
  )
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const pathSegments = Array.isArray(req.query.path) ? req.query.path : []
  const safePath = pathSegments.join('/').replace(/\.\./g, '')
  const fullPath = join(STUDIO_MONACO_DIR, safePath)

  try {
    const data = readFileSync(fullPath)
    res.setHeader('Content-Type', contentTypeFor(fullPath))
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.status(200).send(data)
  } catch {
    return res.status(404).send('Not Found')
  }
}
