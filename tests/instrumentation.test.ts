import { afterEach, describe, expect, it, vi } from 'vitest'
import { register } from '../instrumentation'
import { isNotebookSchedulerRunning, stopNotebookScheduler } from '../lib/notebook-scheduler'

describe('instrumentation register()', () => {
  afterEach(() => {
    stopNotebookScheduler()
    vi.unstubAllEnvs()
  })

  it('starts the notebook scheduler once on the Node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('PGSTUDIO_DISABLE_SCHEDULER', '')
    await register()
    expect(isNotebookSchedulerRunning()).toBe(true)
    await register()
    expect(isNotebookSchedulerRunning()).toBe(true)
  })

  it('does nothing on the edge runtime or when disabled', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await register()
    expect(isNotebookSchedulerRunning()).toBe(false)

    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('PGSTUDIO_DISABLE_SCHEDULER', '1')
    await register()
    expect(isNotebookSchedulerRunning()).toBe(false)
  })
})
