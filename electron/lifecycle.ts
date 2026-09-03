import { app } from 'electron'
import { closeAllPools } from '@/lib/db/pool'
import { closeMetaDb } from '@/lib/meta-db'
import { stopNotebookScheduler } from '@/lib/notebook-scheduler'

/**
 * Close database handles before exit.
 *
 * `pg.Pool#end()` is async, so quitting has to be deferred once with
 * `preventDefault()`. `sqlite.close()` is synchronous, which is what makes the
 * `process.on('exit')` fallback below viable — without its WAL checkpoint,
 * every quit would leave `history.db-wal`/`-shm` next to the database.
 */
export function installShutdownHandlers() {
  let quitting = false

  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    // No new scheduled runs may start while pools are draining.
    stopNotebookScheduler()

    const finish = () => {
      try {
        closeMetaDb()
      } catch (error) {
        console.error('[shutdown] closeMetaDb failed', error)
      }
      app.exit(0)
    }

    // Don't let a hung pool block quitting forever.
    const timeout = setTimeout(finish, 3000)
    closeAllPools()
      .catch((error) => console.error('[shutdown] closeAllPools failed', error))
      .finally(() => {
        clearTimeout(timeout)
        finish()
      })
  })

  process.on('exit', () => {
    try {
      closeMetaDb()
    } catch {
      // Nothing useful to do this late.
    }
  })
}
