import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteSnippet, getSnippets, saveSnippet } from '../../lib/db'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const limit = Number(req.query.limit || 200)
    return res.status(200).json({ items: getSnippets(limit) })
  }

  if (req.method === 'POST') {
    const title = String(req.body?.title || '').trim()
    const queryText = String(req.body?.queryText || '').trim()
    if (!title) return res.status(400).json({ error: 'title is required' })
    if (!queryText) return res.status(400).json({ error: 'queryText is required' })
    const item = saveSnippet({ title, queryText })
    return res.status(200).json({ item })
  }

  if (req.method === 'DELETE') {
    const id = String(req.body?.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id is required' })
    deleteSnippet(id)
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
