import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnvFiles } from '@/server/env-files'

const KEYS = ['PGSTUDIO_ENV_TEST_A', 'PGSTUDIO_ENV_TEST_B', 'PGSTUDIO_ENV_TEST_C']

describe('loadEnvFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pgstudio-env-'))
    for (const key of KEYS) delete process.env[key]
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    for (const key of KEYS) delete process.env[key]
  })

  it('does nothing when no env file exists', () => {
    expect(loadEnvFiles(dir)).toEqual([])
    expect(process.env.PGSTUDIO_ENV_TEST_A).toBeUndefined()
  })

  it('prefers the shell over .env.local over .env', () => {
    writeFileSync(join(dir, '.env.local'), 'PGSTUDIO_ENV_TEST_A=local\nPGSTUDIO_ENV_TEST_B=local\n')
    writeFileSync(
      join(dir, '.env'),
      'PGSTUDIO_ENV_TEST_A=base\nPGSTUDIO_ENV_TEST_B=base\nPGSTUDIO_ENV_TEST_C=base\n'
    )
    process.env.PGSTUDIO_ENV_TEST_A = 'shell'

    expect(loadEnvFiles(dir)).toEqual(['.env.local', '.env'])
    expect(process.env.PGSTUDIO_ENV_TEST_A).toBe('shell')
    expect(process.env.PGSTUDIO_ENV_TEST_B).toBe('local')
    expect(process.env.PGSTUDIO_ENV_TEST_C).toBe('base')
  })

  it('loads .env.local on its own', () => {
    writeFileSync(join(dir, '.env.local'), 'PGSTUDIO_ENV_TEST_A=postgres://u:p@localhost:5433/db\n')
    expect(loadEnvFiles(dir)).toEqual(['.env.local'])
    expect(process.env.PGSTUDIO_ENV_TEST_A).toBe('postgres://u:p@localhost:5433/db')
  })
})
