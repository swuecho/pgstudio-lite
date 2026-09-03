/**
 * Next.js server start-up hook (web build only).
 *
 * The desktop build never sees this file: its `pageExtensions: ['tsx','jsx']`
 * setting excludes `instrumentation.ts`, and the Electron main process starts
 * the scheduler itself once the metadata DB is open.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.PGSTUDIO_DISABLE_SCHEDULER === '1') return
  const { startNotebookScheduler } = await import('./lib/notebook-scheduler')
  startNotebookScheduler()
}
