import { listTables } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { defineRoute } from '@/server/route'

export default defineRoute({
  async GET(req) {
    const { tables, truncated } = await listTables(getRequestConnectionName(req))
    return { tables, truncated }
  },
})
