import { describe, expect, it } from 'vitest'
import {
  buildGeneratePrompt,
  buildNotebookExportCurl,
  buildNotebookImportCurl,
  buildNotebookPatchCurl,
  buildPatchPrompt,
  getJsonParseErrorHint,
  summarizeNotebookDiff,
} from '../lib/notebook-ui'

describe('notebook ui helpers', () => {
  it('buildGeneratePrompt replaces all placeholders', () => {
    const out = buildGeneratePrompt({
      task: 'Analyze monthly revenue',
      dbContext: 'orders(id, amount, created_at)',
      style: 'Business summary',
    })
    expect(out).toContain('Analyze monthly revenue')
    expect(out).toContain('orders(id, amount, created_at)')
    expect(out).toContain('Business summary')
    expect(out).not.toContain('{{TASK_DESCRIPTION}}')
  })

  it('buildPatchPrompt includes current notebook JSON and task', () => {
    const out = buildPatchPrompt({
      patchTask: 'Add top customers section',
      currentNotebookJson: '{"title":"A"}',
    })
    expect(out).toContain('Add top customers section')
    expect(out).toContain('{"title":"A"}')
  })

  it('getJsonParseErrorHint returns line and column when position exists', () => {
    const hint = getJsonParseErrorHint(
      new Error('Unexpected token } in JSON at position 14'),
      '{\n  "a": 1,\n}'
    )
    expect(hint.line).toBeGreaterThanOrEqual(1)
    expect(hint.column).toBeGreaterThanOrEqual(1)
  })

  it('summarizeNotebookDiff computes structural changes', () => {
    const a = {
      spec_version: '1.0' as const,
      title: 'A',
      description: '',
      connection_name: 'default',
      metadata: {},
      cells: [
        { id: 'c1', type: 'markdown' as const, content: '# one' },
        { id: 'c2', type: 'sql' as const, content: 'select 1;' },
      ],
    }
    const b = {
      spec_version: '1.0' as const,
      title: 'B',
      description: '',
      connection_name: 'default',
      metadata: { source: 'codex' },
      cells: [
        { id: 'c2', type: 'sql' as const, content: 'select 2;' },
        { id: 'c3', type: 'markdown' as const, content: '# two' },
      ],
    }
    const summary = summarizeNotebookDiff(a, b)
    expect(summary.titleChanged).toBe(true)
    expect(summary.metadataChanged).toBe(true)
    expect(summary.addedCellIds).toEqual(['c3'])
    expect(summary.removedCellIds).toEqual(['c1'])
    expect(summary.changedCellContentIds).toEqual(['c2'])
    expect(summary.reorderedCellCount).toBe(1)
  })

  it('build curl snippets include expected endpoints', () => {
    expect(buildNotebookImportCurl('{"mode":"create"}')).toContain('/api/notebooks/import')
    expect(buildNotebookExportCurl('nb-1')).toContain('/api/notebooks/nb-1/export')
    expect(buildNotebookPatchCurl('nb-1', '{"ops":[]}')).toContain('/api/notebooks/nb-1/patch')
  })
})
