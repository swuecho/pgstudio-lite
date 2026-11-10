// Like types/pg.d.ts: the slice of pg-cursor this app uses, without pulling
// in @types/pg (which would retype every `pg` import).
declare module 'pg-cursor' {
  type CursorResult = {
    command: string | null
    rowCount: number | null
    fields: Array<{ name: string }>
  }

  export default class Cursor<Row = Record<string, unknown>> {
    constructor(
      text: string,
      values?: unknown[],
      config?: { types?: { getTypeParser: (oid: number, format?: 'text' | 'binary') => unknown } }
    )
    read(
      maxRows: number,
      callback: (error: Error | undefined, rows: Row[], result: CursorResult) => void
    ): void
    close(): Promise<void>
  }
}
