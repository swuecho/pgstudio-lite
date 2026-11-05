import { listSchemaObjects } from '@/lib/db'
import { getRequestConnectionName } from '@/lib/api/connection'
import { defineRoute } from '@/server/route'

export default defineRoute({
  async GET(req) {
    const tables = await listSchemaObjects(getRequestConnectionName(req))
    return { tables }
  },
})
