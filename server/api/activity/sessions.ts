import { getActivitySessions } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { defineRoute } from '@/server/route'

export default defineRoute({
  async GET(req) {
    const sessions = await getActivitySessions(getRequestConnectionName(req))
    return { sessions, fetchedAt: new Date().toISOString() }
  },
})
