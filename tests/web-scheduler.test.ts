import { afterEach, describe, expect, it, vi } from 'vitest'
import { startWebScheduler } from '../server/web'
import { isNotebookSchedulerRunning, stopNotebookScheduler } from '../lib/notebook-scheduler'

describe('startWebScheduler()', () => {
  afterEach(() => {
    stopNotebookScheduler()
    vi.unstubAllEnvs()
  })

  it('starts the notebook scheduler once', async () => {
    vi.stubEnv('PGSTUDIO_DISABLE_SCHEDULER', '')
    await startWebScheduler()
    expect(isNotebookSchedulerRunning()).toBe(true)
    await startWebScheduler()
    expect(isNotebookSchedulerRunning()).toBe(true)
  })

  it('does nothing when disabled', async () => {
    vi.stubEnv('PGSTUDIO_DISABLE_SCHEDULER', '1')
    await startWebScheduler()
    expect(isNotebookSchedulerRunning()).toBe(false)
  })
})
