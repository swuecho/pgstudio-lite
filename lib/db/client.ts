import { getConnectionByName } from './connections'
import { getPool, type PoolClient } from './pool'

export async function withClient<T>(
  connectionName: string | undefined,
  fn: (client: PoolClient) => Promise<T>
) {
  const connection = getConnectionByName(connectionName)
  const pool = getPool(connection.connectionString)
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}
