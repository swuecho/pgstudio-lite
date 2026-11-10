import Cursor from 'pg-cursor'
import { pgTypes, type PoolClient } from './pool'

export type CappedQueryResult = {
  /** `null` when the result had more than `maxRows` rows and was cut off. */
  command: string | null
  rowCount: number | null
  fields: Array<{ name: string }>
  rows: Record<string, unknown>[]
}

/**
 * Runs one statement through a portal and fetches at most `maxRows` rows, so
 * Postgres stops producing (and Node stops buffering) once there are enough.
 * Pass the display limit plus one to tell "exactly the limit" from "more".
 *
 * When the portal is cut off, Postgres never reports the command tag, so the
 * total row count is unknown: `command` and `rowCount` come back `null`.
 */
export async function queryCapped(
  client: PoolClient,
  text: string,
  values: unknown[] | undefined,
  maxRows: number
): Promise<CappedQueryResult> {
  const cursor: Cursor = client.query(new Cursor(text, values, { types: pgTypes }))
  const { rows, result } = await new Promise<{
    rows: Record<string, unknown>[]
    result: { command: string | null; rowCount: number | null; fields: Array<{ name: string }> }
  }>((resolve, reject) => {
    cursor.read(maxRows, (error, rows, result) => (error ? reject(error) : resolve({ rows, result })))
  })
  // Only after success: on error the cursor has already sent Sync, and a
  // Close now would leave a stray reply for the client's next query.
  await cursor.close()
  return { command: result.command || null, rowCount: result.rowCount, fields: result.fields, rows }
}
