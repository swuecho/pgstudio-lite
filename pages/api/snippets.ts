import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteSnippet, getSnippets, saveSnippet, updateSnippet } from '../../lib/db'

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

  if (req.method === 'PATCH') {
    const id = String(req.body?.id || '').trim()
    const hasTitle = typeof req.body?.title === 'string'
    const hasQueryText = typeof req.body?.queryText === 'string'
    const title = hasTitle ? String(req.body.title).trim() : undefined
    const queryText = hasQueryText ? String(req.body.queryText).trim() : undefined

    if (!id) return res.status(400).json({ error: 'id is required' })
    if (!hasTitle && !hasQueryText) {
      return res.status(400).json({ error: 'title or queryText is required' })
    }
    if (hasTitle && !title) return res.status(400).json({ error: 'title cannot be empty' })
    if (hasQueryText && !queryText) return res.status(400).json({ error: 'queryText cannot be empty' })

    const item = updateSnippet({ id, title, queryText })
    if (!item) return res.status(404).json({ error: 'snippet not found' })
    return res.status(200).json({ item })
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
