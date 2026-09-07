import { describe, expect, it } from 'vitest'
import { compileSqlTemplate, extractTemplateKeys } from '../lib/notebook-params'

describe('notebook SQL params', () => {
  it('extracts unique template keys', () => {
    const keys = extractTemplateKeys(
      'select * from t where d >= {{start_date}} and d <= {{ end_date }} and d >= {{start_date}}'
    )
    expect(keys).toEqual(['start_date', 'end_date'])
  })

  it('compiles placeholders into parameterized SQL', () => {
    const compiled = compileSqlTemplate('select * from t where d >= {{start_date}} and n <= {{limit}}', {
      start_date: '2026-02-01',
      limit: 25,
    })

    expect(compiled.text).toBe('select * from t where d >= $1 and n <= $2')
    expect(compiled.values).toEqual(['2026-02-01', 25])
    expect(compiled.keys).toEqual(['start_date', 'limit'])
  })

  it('reuses the same positional index when placeholder repeats', () => {
    const compiled = compileSqlTemplate('select * from t where a = {{k}} or b = {{k}}', { k: 'x' })
    expect(compiled.text).toBe('select * from t where a = $1 or b = $1')
    expect(compiled.values).toEqual(['x'])
  })

  it('throws when a key is missing', () => {
    expect(() => compileSqlTemplate('select {{missing}}', {})).toThrow(
      "Missing input value for '{{missing}}'"
    )
  })
})

describe('executed query debug info', () => {
  it('describes each bound value with its placeholder, type and source', async () => {
    const { buildExecutedQueryInfo, compileSqlTemplate } = await import('../lib/notebook-params')
    const compiled = compileSqlTemplate(
      'select * from distribution_stores where organization_id = {{org}} and status = {{status}}',
      { org: 'abc-123', status: '' }
    )
    const info = buildExecutedQueryInfo({ ...compiled, sourceByKey: { org: 'widget', status: 'request' } })

    expect(info.text).toBe('select * from distribution_stores where organization_id = $1 and status = $2')
    expect(info.values).toEqual(['abc-123', ''])
    expect(info.params).toEqual([
      { key: 'org', placeholder: '$1', value: 'abc-123', valueType: 'string', source: 'widget' },
      {
        key: 'status',
        placeholder: '$2',
        value: '',
        valueType: 'string',
        source: 'request',
        warning: 'Value is an empty string.',
      },
    ])
  })

  it('warns about null and array values', async () => {
    const { buildExecutedQueryInfo } = await import('../lib/notebook-params')
    const info = buildExecutedQueryInfo({
      text: 'select $1, $2',
      values: [null, ['a', 'b']],
      keys: ['n', 'ids'],
      sourceByKey: {},
    })
    expect(info.params[0].valueType).toBe('null')
    expect(info.params[0].warning).toContain('IS NULL')
    expect(info.params[1].valueType).toBe('array(2)')
    expect(info.params[1].warning).toContain('= ANY({{ids}})')
  })

  it('inlines values as SQL literals without touching $10 when replacing $1', async () => {
    const { renderSqlWithInlineValues } = await import('../lib/notebook-params')
    const values = ["O'Reilly", 5, true, null, ['x', 'y'], 6, 7, 8, 9, 'ten']
    const rendered = renderSqlWithInlineValues('select $1, $2, $3, $4, $5, $10, $11', values)
    expect(rendered).toBe("select 'O''Reilly', 5, TRUE, NULL, ARRAY['x', 'y'], 'ten', $11")
  })
})
