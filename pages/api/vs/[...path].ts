import type { NextApiRequest, NextApiResponse } from 'next'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'

const MONACO_VS_DIR = resolve(join(process.cwd(), 'node_modules', 'monaco-editor', 'min', 'vs'))

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
  if (
    pathSegments.some(
      (segment) => typeof segment !== 'string' || segment.length === 0 || !/^[A-Za-z0-9._-]+$/.test(segment)
    )
  ) {
    return res.status(400).send('Bad Request')
  }
  const fullPath = resolve(MONACO_VS_DIR, pathSegments.join('/'))
  if (fullPath !== MONACO_VS_DIR && !fullPath.startsWith(MONACO_VS_DIR + sep)) {
    return res.status(400).send('Bad Request')
  }

  try {
    if (!existsSync(fullPath)) return res.status(404).send('Not Found')
    const data = readFileSync(fullPath)
    res.setHeader('Content-Type', contentTypeFor(fullPath))
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.status(200).send(data)
  } catch {
    return res.status(404).send('Not Found')
  }
}
