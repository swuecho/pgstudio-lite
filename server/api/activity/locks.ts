import { getActivityLocks } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { defineRoute } from '@/server/route'

export default defineRoute({
  async GET(req) {
    const locks = await getActivityLocks(getRequestConnectionName(req))
    return { locks, fetchedAt: new Date().toISOString() }
  },
})
